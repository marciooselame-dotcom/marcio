/**
 * VoiceEngine v2.0 — Motor de Voz Híbrido e Serializado.
 * Controla a alternância física entre Web Speech API (comandos) e Gemini (ditado).
 */
const VoiceEngine = (() => {
    let callbacks = {
        onCommand: null,
        onRawTranscription: null,
        onStatusChange: null,
        onPhaseChange: null
    };

    let activePhase = 'IDLE'; // 'IDLE' -> 'CONFIG' -> 'DICTATION' -> 'OFF'
    let webSpeechRecognizer = null;
    
    let geminiMediaRecorder = null;
    let geminiStream = null;
    let geminiAudioChunks = [];
    let geminiSilenceTimer = null;
    let audioContext = null;
    let isTerminating = false; // BLOQUEIO DE SEGURANÇA: Garante uma única execução da finalização.
    
    const SILENCE_THRESHOLD = 0.015; 
    const SILENCE_DELAY = 2000; 
    
    let currentGeminiTransaction = null; // RASTREADOR DE REDE: Garante que o desligamento ESPERE a internet responder.

    function init(config) {
        callbacks = { ...callbacks, ...config };
        return true;
    }

    function setPhase(newPhase) {
        activePhase = newPhase;
        console.log(`[VoiceEngine] Alteração de Fase: ${newPhase}`);
        callbacks.onPhaseChange?.(newPhase);
    }

    // =========================================================================
    // ETAPA 1: NATIVE WEB SPEECH API (Configuração de Metadados)
    // =========================================================================
    function startConfigPhase() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            callbacks.onStatusChange?.('error', 'Web Speech API não suportada neste navegador.');
            return;
        }

        setPhase('CONFIG');
        callbacks.onStatusChange?.('listening', 'Fase 1: Dite "Paciente..." ou "Laudo..."');

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        webSpeechRecognizer = new SpeechRecognition();
        webSpeechRecognizer.continuous = true;
        webSpeechRecognizer.interimResults = true;
        webSpeechRecognizer.lang = 'pt-BR';

        webSpeechRecognizer.onresult = (event) => {
            let fullTranscript = '';
            // Lê TUDO (interim + final) do buffer atual para resposta ultra rápida e sem travas
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript;
            }

            if (fullTranscript.trim()) {
                console.log("[WebSpeech Ultra-Fast] Analisando:", fullTranscript);
                // Processa em TEMPO REAL sem esperar 'isFinal'
                processConfigCommands(fullTranscript.toLowerCase().trim());
            }
        };

        webSpeechRecognizer.onerror = (e) => {
            console.error("[WebSpeech Error]", e);
        };

        webSpeechRecognizer.onend = () => {
            if (activePhase === 'CONFIG') {
                webSpeechRecognizer.start();
            }
        };

        webSpeechRecognizer.start();
    }

    function processConfigCommands(text) {
        // 1. Captura do Paciente (Aceita acentuação global e corta se encontrar o próximo comando 'laudo')
        const patientMatch = text.match(/paciente\s+([^.,]+)/i);
        if (patientMatch) {
            // Split em ' laudo ' garante que se ele disser "Paciente X Laudo Y" a gente pegue só o X.
            let name = patientMatch[1].split(" laudo ")[0].trim();
            if (name && name.length > 1) {
                callbacks.onCommand?.({ action: 'setPatient', value: name });
            }
        }

        // 2. Captura do Template (Aceita acentuação e corta se encontrar o termo 'paciente' ou 'iniciar')
        const templateMatch = text.match(/laudo\s+([^.,]+)/i);
        if (templateMatch) {
            let template = templateMatch[1].split(" paciente ")[0].split(" iniciar ")[0].trim();
            if (template && template.length > 1) {
                callbacks.onCommand?.({ action: 'loadTemplate', value: template });
            }
        }
        
        // 3. Comandos de Fluxo
        if (text.includes("iniciar ditado") || text.includes("começar exame") || text.includes("pronto")) {
            stopConfigAndSwitchToGemini();
        }
    }

    function stopConfigAndSwitchToGemini() {
        if (webSpeechRecognizer) {
            webSpeechRecognizer.onend = null; // Mata o autostart
            webSpeechRecognizer.stop();
            webSpeechRecognizer = null;
        }
        console.log("[VoiceEngine] Web Speech API Desativado Automaticamente.");
        
        // Transição natural para a Fase Gemini
        setTimeout(() => {
            startDictationPhase();
        }, 500);
    }

    // =========================================================================
    // ETAPA 2: GEMINI MEDICAL DICTATION (Captura de Alta Qualidade)
    // =========================================================================
    async function startDictationPhase() {
        setPhase('DICTATION');
        isTerminating = false; // Libera a trava para o novo ciclo
        callbacks.onStatusChange?.('listening', 'Fase 2: Ditado Clínico Gemini Ativo.');
        
        try {
            geminiStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            await startGeminiRecorderCycle();
        } catch (err) {
            callbacks.onStatusChange?.('error', 'Falha ao acessar o microfone para Gemini.');
            setPhase('IDLE');
        }
    }

    async function startGeminiRecorderCycle() {
        if (activePhase !== 'DICTATION') return;
        
        geminiAudioChunks = [];
        geminiMediaRecorder = new MediaRecorder(geminiStream);
        
        // Configura o Detector de Silêncio para fechar ciclos dinâmicos de som
        setupSilenceDetector();

        geminiMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) geminiAudioChunks.push(e.data);
        };

        geminiMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(geminiAudioChunks, { type: 'audio/webm' });
            if (audioBlob.size > 1000) {
                // CAPTURA O PROCESSO DE REDE PARA PODER SER ESPERADO CASO O APP DESLIGUE!
                currentGeminiTransaction = processGeminiVoice(audioBlob);
                await currentGeminiTransaction;
                currentGeminiTransaction = null;
            } else if (activePhase === 'DICTATION' && !isTerminating) {
                // Só reinicia o gravador se a fase for correta E NÃO ESTIVERMOS FINALIZANDO.
                startGeminiRecorderCycle();
            }
        };

        geminiMediaRecorder.start();
    }

    function setupSilenceDetector() {
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(geminiStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        const dataArray = new Float32Array(analyser.fftSize);
        source.connect(analyser);

        const checkVolume = () => {
            if (activePhase !== 'DICTATION' || !geminiMediaRecorder || geminiMediaRecorder.state === 'inactive') return;
            
            analyser.getFloatTimeDomainData(dataArray);
            let sumSquares = 0;
            for (const amp of dataArray) sumSquares += amp * amp;
            const rms = Math.sqrt(sumSquares / analyser.fftSize);

            if (rms < SILENCE_THRESHOLD) {
                if (!geminiSilenceTimer) {
                    geminiSilenceTimer = setTimeout(() => {
                        console.log("[GeminiDetector] Pausa na fala detectada. Processando lote...");
                        stopCurrentGeminiCycle();
                    }, SILENCE_DELAY);
                }
            } else {
                if (geminiSilenceTimer) {
                    clearTimeout(geminiSilenceTimer);
                    geminiSilenceTimer = null;
                }
            }
            requestAnimationFrame(checkVolume);
        };
        requestAnimationFrame(checkVolume);
    }

    function stopCurrentGeminiCycle() {
        if (geminiSilenceTimer) clearTimeout(geminiSilenceTimer);
        geminiSilenceTimer = null;

        if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
            geminiMediaRecorder.stop();
        }
    }

    async function processGeminiVoice(blob) {
        callbacks.onStatusChange?.('loading', 'Gemini Transcrevendo...');
        try {
            if (typeof GeminiService === 'undefined') throw new Error("GeminiService Indisponível");
            
            // Transcrição pura 1:1 verbatim sem inteligência
            const text = await GeminiService.transcribeAudio(blob);
            
            if (text && text.trim()) {
                console.log("[Gemini Output]:", text);
                
                // Verifica IMEDIATAMENTE se tem o comando de desligar
                const lowerText = text.toLowerCase();
                const isFinishCommand = lowerText.includes("finalizar exame") || 
                                        lowerText.includes("concluir relatório") || 
                                        lowerText.includes("encerrar exame") ||
                                        lowerText.includes("concluir laudo");

                // GATILHO DE FINALIZAÇÃO COM TRAVA DE SEGURANÇA ANTI-DUPLICIDADE
                if (isFinishCommand && !isTerminating) {
                    isTerminating = true; // TRANCAR A PORTA IMEDIATAMENTE!
                    console.log("[VoiceEngine] Comando de Conclusão detectado. Iniciando Buffer de Espera de 3s para garantir as últimas palavras...");
                    await callbacks.onRawTranscription?.(text); // Registra as palavras atuais
                    
                    callbacks.onStatusChange?.('loading', 'Processando últimas palavras...');
                    
                    // Buffer de Segurança: Aguarda 3 segundos rodando no fundo para qualquer outro blob ou rede terminar
                    await new Promise(r => setTimeout(r, 3000));
                    
                    // Passamos TRUE para o shutdown saber que a chamada veio DE DENTRO do próprio processo de rede.
                    // Isso evita que ele espere por SI MESMO (Deadlock).
                    await shutdownAllMicrophones(true); 
                    callbacks.onCommand?.({ action: 'FORCE_FINISH' }); // E dispara as IAs finais.
                    return;
                }

                // Entrega a transcrição crua para o app
                await callbacks.onRawTranscription?.(text);
            }

            callbacks.onStatusChange?.('listening', 'Ditado Clínico Ativo.');

            // Reinicia o ciclo se ainda estivermos na fase de ditado
            if (activePhase === 'DICTATION') {
                setTimeout(() => startGeminiRecorderCycle(), 200);
            }
        } catch (err) {
            console.error("[Gemini Processing Err]", err);
            callbacks.onStatusChange?.('error', `Erro Gemini: ${err.message}`);
            if (activePhase === 'DICTATION') setTimeout(() => startGeminiRecorderCycle(), 1000);
        }
    }

    async function shutdownAllMicrophones(skipNetworkWait = false) {
        console.log("[VoiceEngine] Iniciando Desligamento Gracioso. Limpando Buffers...");
        
        // 1. SALVA-VIDAS: Se houver uma gravação ainda aberta, força o fechamento dela agora.
        if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
            const waitForHardware = new Promise(resolve => {
                geminiMediaRecorder.addEventListener('stop', resolve, { once: true });
                geminiMediaRecorder.stop(); // Isso vai disparar o 'onstop' e criar o currentGeminiTransaction!
            });
            await waitForHardware; // Espera a peça de áudio física ser gerada.
            
            // Pequeníssima pausa técnica para dar tempo da trigger assíncrona do 'onstop' atribuir a variável.
            await new Promise(r => setTimeout(r, 100)); 
        }

        // 2. BLOQUEIO ABSOLUTO DE REDE: Espera a última conexão com o Gemini ACABAR
        // Apenas se não formos o próprio processo de rede que pediu o encerramento (evita deadlock).
        if (currentGeminiTransaction && !skipNetworkWait) {
            console.log("[VoiceEngine] REDE ATIVA DETECTADA. Aguardando resposta da Nuvem para não perder dados...");
            await currentGeminiTransaction; // Trava o desligamento até o texto chegar da Internet!
        }

        setPhase('OFF');
        
        // 3. Agora sim, desliga fisicamente o hardware
        if (geminiStream) {
            geminiStream.getTracks().forEach(t => t.stop());
            geminiStream = null;
        }
        if (audioContext && audioContext.state !== 'closed') {
            await audioContext.close();
        }
        if (geminiSilenceTimer) clearTimeout(geminiSilenceTimer);
        
        console.log("[VoiceEngine] TODOS OS MICROFONES FORAM DESLIGADOS COM SUCESSO.");
    }

    function toggleMainButton() {
        if (activePhase === 'IDLE') {
            startConfigPhase();
        } else if (activePhase === 'CONFIG') {
            // Força a transição manual se o usuário não usou comando de voz
            stopConfigAndSwitchToGemini();
        } else {
            // Se estiver em ditado e clicar, desliga na marra.
            shutdownAllMicrophones();
        }
    }

    return {
        init,
        toggleMainButton,
        startConfig: startConfigPhase,
        switchToGemini: stopConfigAndSwitchToGemini,
        kill: shutdownAllMicrophones,
        getCurrentPhase: () => activePhase
    };
})();
