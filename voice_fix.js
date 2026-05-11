/**
 * VoiceEngine v4.0 — Híbrido Inteligente Gated.
 * Fase CONFIG: Usa WebSpeech para detecção de FIM DE FRASE e dispara Gemini para capturar Nome/Template perfeitamente.
 * Fase DICTATION: Trava a gravação em modo contínuo ININTERRUPTO de alta fidelidade.
 */
const VoiceEngine = (() => {
    let callbacks = {
        onCommand: null,
        onRawTranscription: null,
        onStatusChange: null,
        onPhaseChange: null
    };

    let activePhase = 'IDLE'; 
    let webSpeechRecognizer = null;
    
    let geminiMediaRecorder = null;
    let geminiStream = null;
    let geminiAudioChunks = [];
    let isTerminating = false; 
    let isCycling = false; // Flag para controle de troca rápida no Config
    let configSilenceTimer = null; // NOVO: Timer de resiliência para silêncio

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
    // MOTOR WEBSPEECH GLOBAL (Monitor de Silêncio e Visualizador)
    // =========================================================================
    function startGlobalRecognition() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            callbacks.onStatusChange?.('error', 'Seu navegador não suporta reconhecimento de voz nativo.');
            return false;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        webSpeechRecognizer = new SpeechRecognition();
        webSpeechRecognizer.continuous = true;
        webSpeechRecognizer.interimResults = true;
        webSpeechRecognizer.lang = 'pt-BR';

        webSpeechRecognizer.onresult = (event) => {
            let hasFinalResult = false;
            let finalTranscript = '';
            let interimTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    hasFinalResult = true;
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // 1. EM FASE DE CONFIGURAÇÃO (COM TIMER DE RESILIÊNCIA):
            if (activePhase === 'CONFIG' && !isCycling) {
                const currentInput = (finalTranscript + " " + interimTranscript).trim();
                
                if (currentInput.length > 2) {
                    // FEEDBACK VISUAL EM TEMPO REAL! O usuário vê que o sistema está ouvindo!
                    callbacks.onStatusChange?.('listening', `🎤 Escutando: "${currentInput}"...`);
                    
                    clearTimeout(configSilenceTimer);
                    
                    if (hasFinalResult) {
                        console.log("[VoiceEngine] Frase final capturada. Disparando Gemini.");
                        cycleConfigAudioAndProcess();
                    } else {
                        configSilenceTimer = setTimeout(() => {
                            console.log("[VoiceEngine] Timer de Silêncio estourou. Forçando commit.");
                            cycleConfigAudioAndProcess();
                        }, 1800);
                    }
                }
            } 
            
            // 2. EM FASE DE DITADO:
            else if (activePhase === 'DICTATION') {
                if (finalTranscript.trim()) {
                    processDictationContent(finalTranscript.trim());
                }
            }
        };

        webSpeechRecognizer.onerror = (e) => { console.error("[WebSpeech Error]", e); };
        webSpeechRecognizer.onend = () => {
            if (activePhase !== 'IDLE' && activePhase !== 'OFF' && !isTerminating) {
                try { webSpeechRecognizer.start(); } catch(e) {}
            }
        };

        webSpeechRecognizer.start();
        return true;
    }

    // =========================================================================
    // FASE 1 & 2: CAPTURA DE METADADOS COM GEMINI DINÂMICO
    // =========================================================================
    async function startConfigPhase() {
        setPhase('CONFIG');
        isTerminating = false;
        isCycling = false;
        callbacks.onStatusChange?.('listening', '👉 ETAPA 1: Diga "Paciente [Nome]"');
        
        if (!webSpeechRecognizer) {
            startGlobalRecognition();
        }

        // Inicia o hardware de áudio Gemini já no Config para não perder o Nome!
        try {
            if (!geminiStream) {
                geminiStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            startRecordingSlice();
        } catch (err) {
            console.error("Falha hardware no Config:", err);
        }
    }

    // Inicia um gravador sliceado (curto)
    function startRecordingSlice() {
        if (activePhase !== 'CONFIG') return;
        
        geminiAudioChunks = [];
        geminiMediaRecorder = new MediaRecorder(geminiStream);
        
        geminiMediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) geminiAudioChunks.push(e.data);
        };
        
        geminiMediaRecorder.start(); 
    }

    // Ciclo rápido disparado quando o WebSpeech diz que a frase acabou
    async function cycleConfigAudioAndProcess() {
        if (isCycling || !geminiMediaRecorder || geminiMediaRecorder.state === 'inactive') return;
        isCycling = true;

        // 1. Para e pega o que foi gravado AGORA
        const stopPromise = new Promise(res => { geminiMediaRecorder.onstop = res; });
        geminiMediaRecorder.stop();
        await stopPromise;

        const sliceBlob = new Blob(geminiAudioChunks, { type: 'audio/webm' });

        // 2. Reinicia instantaneamente o gravador para a PRÓXIMA frase (Laudo)
        startRecordingSlice();
        isCycling = false;

        // 3. Envia o áudio curto para o Gemini decifrar com Perfeição
        // Removemos limites arbitrários de tamanho para garantir que NADA seja bloqueado!
        if (sliceBlob && sliceBlob.size > 0) {
            callbacks.onStatusChange?.('loading', '🧠 GEMINI validando comando...');
            console.log(`[VoiceEngine] Enviando Comando (${sliceBlob.size} bytes) ao Gemini...`);
            try {
                const geminiText = await GeminiService.transcribeAudio(sliceBlob);
                if (geminiText && geminiText.trim()) {
                    console.log("[VoiceEngine] Gemini Decifrou:", geminiText);
                    processConfigCommands(geminiText);
                } else {
                    // Feedback amigável se veio vazio
                    callbacks.onStatusChange?.('listening', '👉 Não entendi, repita: "Paciente [Nome]"');
                }
            } catch (err) {
                console.warn("Falha Gemini Config:", err);
                // NÃO SEJA SILENCIOSO! Avise o usuário se houver erro de rede/chave!
                callbacks.onStatusChange?.('error', `Erro Gemini: ${err.message || 'Falha na verificação'}`);
            }
        } else {
            isCycling = false; // Libera se o blob for nulo
        }
    }

    function processConfigCommands(text) {
        const lower = text.toLowerCase();
        
        // 1. EXTRAÇÃO INTELIGENTE VIA REGEX (Do Texto do Gemini agora!)
        const patientMatch = text.match(/paciente\s+([^.,\n]+)/i);
        if (patientMatch) {
            let name = patientMatch[1].trim();
            if (name.length > 1) callbacks.onCommand?.({ action: 'setPatient', value: name });
        }

        const templateMatch = text.match(/laudo\s+([^.,\n]+)/i);
        if (templateMatch) {
            let template = templateMatch[1].split(" iniciar ")[0].trim();
            if (template.length > 1) callbacks.onCommand?.({ action: 'loadTemplate', value: template });
        }
    }

    // =========================================================================
    // FASE 3: DITADO MESTRE ININTERRUPTO (Mesma lógica v3.0 de sucesso)
    // =========================================================================
    async function switchToDictationPhase() {
        // Para o gravador cíclico anterior se existir
        if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
            geminiMediaRecorder.stop();
        }
        
        setPhase('DICTATION');
        callbacks.onStatusChange?.('loading', 'Ativando Captura Mestra Ininterrupta...');

        try {
            if (!geminiStream) {
                geminiStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            
            geminiAudioChunks = [];
            geminiMediaRecorder = new MediaRecorder(geminiStream);
            
            geminiMediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) geminiAudioChunks.push(e.data);
            };

            // Sem timeslice = Um único arquivo WebM com metadados perfeitos ao fechar!
            geminiMediaRecorder.start();
            
            callbacks.onStatusChange?.('listening', '🎙️ DITADO ATIVO: Grave à vontade...');
            console.log("[VoiceEngine] Motor Ininterrupto Iniciado.");

        } catch (err) {
            console.error("Falha Acesso Microfone:", err);
            callbacks.onStatusChange?.('error', 'Falha Crítica ao Acessar Microfone.');
        }
    }

    async function processDictationContent(text) {
        // Preview nativo instantâneo
        callbacks.onRawTranscription?.(text, false); 

        const lower = text.toLowerCase();
        const isFinish = lower.includes("finalizar exame") || 
                         lower.includes("concluir relatório") || 
                         lower.includes("encerrar exame") || 
                         lower.includes("concluir laudo");

        if (isFinish && !isTerminating) {
            triggerFinalProcessingFlow();
        }
    }

    async function triggerFinalProcessingFlow() {
        if (isTerminating) return;
        isTerminating = true; 

        callbacks.onStatusChange?.('loading', '🏁 Finalizando Fluxo...');

        if (geminiMediaRecorder && geminiMediaRecorder.state !== 'inactive') {
            const waitForHardwareStop = new Promise(resolve => {
                geminiMediaRecorder.onstop = resolve;
                geminiMediaRecorder.stop();
            });
            await waitForHardwareStop;
        }

        const finalAudioFile = new Blob(geminiAudioChunks, { type: 'audio/webm' });
        if (finalAudioFile.size < 2000) {
            callbacks.onStatusChange?.('error', 'Áudio insuficiente.');
            isTerminating = false;
            return;
        }

        callbacks.onStatusChange?.('loading', '🚀 GEMINI transcrevendo laudo inteiro...');
        
        try {
            const masterTranscription = await GeminiService.transcribeAudio(finalAudioFile);
            if (masterTranscription && masterTranscription.trim()) {
                await callbacks.onRawTranscription?.(masterTranscription, true); 
                callbacks.onStatusChange?.('loading', '🧠 Rodando Fusão Final de IAs...');
                callbacks.onCommand?.({ action: 'FORCE_FINISH' });
            } else {
                callbacks.onCommand?.({ action: 'FORCE_FINISH' });
            }
        } catch (err) {
            console.error("[VoiceEngine] Falha Gemini Mestre:", err);
            callbacks.onCommand?.({ action: 'FORCE_FINISH' });
        } finally {
            shutdownAllHardware();
        }
    }

    function shutdownAllHardware() {
        setPhase('OFF');
        if (geminiStream) {
            geminiStream.getTracks().forEach(t => t.stop());
            geminiStream = null;
        }
        if (webSpeechRecognizer) {
            webSpeechRecognizer.onend = null;
            webSpeechRecognizer.stop();
            webSpeechRecognizer = null;
        }
    }

    return {
        init,
        startConfig: startConfigPhase,
        switchToGemini: switchToDictationPhase,
        kill: async () => { 
            if(activePhase === 'DICTATION') await triggerFinalProcessingFlow(); 
            else shutdownAllHardware(); 
        },
        commitCurrentConfig: () => {
            if (activePhase === 'CONFIG') cycleConfigAudioAndProcess();
        },
        getCurrentPhase: () => activePhase
    };
})();
