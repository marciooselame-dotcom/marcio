/**
 * App Orchestrator v2.1 — Renderização Baseada em Estado Unificado.
 * Elimina duplicidade e acúmulo caótico de textos.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- ELEMENTOS DA DOM ---
    const textEditor = document.getElementById('finalEditor');
    const btnRecord = document.getElementById('toggle-record');
    const statusDot = document.getElementById('connection-status');
    const micLabel = document.getElementById('status-text');

    // --- ESTADO CENTRAL DO APLICATIVO ---
    let currentWorkflowState = 'IDLE'; 
    let isAutoTransitioning = false; // TRAVA DE SEGURANÇA 1: Evita disparos múltiplos de ativação.
    let isRefiningProcessActive = false; // TRAVA DE SEGURANÇA 2: Evita duplicidade na fusão e no salvamento.
    const docState = {
        patientName: "",
        currentDate: new Date().toLocaleDateString('pt-BR'),
        templateContent: "",
        rawDictationBuffer: "" // Acumulado final do Gemini
    };

    // Função Unificada que "Pinta" a tela com base no estado atual
    function renderEditor() {
        let finalContent = "";

        // 1. O Cabeçalho (Se houver)
        if (docState.patientName) {
            finalContent += `PACIENTE: ${docState.patientName.toUpperCase()}\nDATA: ${docState.currentDate}\n\n`;
        }

        // 2. O Template (Se houver)
        if (docState.templateContent) {
            // Se já houver template, ele é a base.
            // Vamos injetar o texto ditado no buffer raw mais abaixo para o usuário ver 
            // ou fundir visualmente? Vamos apenas colar o template.
            finalContent += docState.templateContent + "\n";
        }

        // 3. A Transcrição Bruta (Exibida para conferência do médico)
        if (docState.rawDictationBuffer.trim()) {
            finalContent += "\n\n--- CONFERÊNCIA DA TRANSCRIÇÃO BRUTA ---\n" + docState.rawDictationBuffer.trim() + "\n";
        }

        textEditor.innerHTML = formatLaudoHTML(finalContent);
        textEditor.scrollTop = textEditor.scrollHeight;
    }

    function updateUIStatus(state, message) {
        if(micLabel) micLabel.innerText = message;
        if(statusDot) statusDot.className = 'status-dot ' + state;
        
        if(btnRecord) {
            if (state === 'listening') {
                btnRecord.classList.add('recording');
            } else {
                btnRecord.classList.remove('recording');
            }
        }
    }

    // --- ORQUESTRADOR DE FASES ---
    const AppStages = {
        
        // ETAPA 1: METADADOS DINÂMICOS
        handleMetadataCommand: (cmd) => {
            console.log("[AppStages] Recebido Comando de Metadados:", cmd);
            
            // ETAPA 1: BLOQUEIA ATÉ RECEBER PACIENTE
            if (cmd.action === 'setPatient' && !docState.patientName) {
                docState.patientName = cmd.value.trim();
                updateUIStatus('success', `✅ Paciente Definido: ${cmd.value}`);
                renderEditor();
                
                // Avisa para a próxima etapa
                setTimeout(() => {
                    if (!docState.templateContent) {
                        updateUIStatus('listening', '👉 ETAPA 2: Fale "Laudo [Parte e Lado]"');
                    }
                }, 1500);
                return;
            }

            // ETAPA 2: SÓ PERMITE SE JÁ TIVER PACIENTE, MAS AINDA NÃO TEM TEMPLATE
            if (cmd.action === 'loadTemplate' && docState.patientName && !docState.templateContent) {
                const lookup = cmd.value.toLowerCase();
                let found = null;
                if (typeof ReportTemplates !== 'undefined') {
                    found = ReportTemplates.getTemplate(lookup);
                }
                
                docState.templateContent = found || `[TEMPLATE NÃO ENCONTRADO PARA "${cmd.value}"]\nANÁLISE:\n[Aguardando]\nIMPRESSÃO:\nEstudo normal.`;
                updateUIStatus('success', `✅ Modelo Carregado: ${cmd.value}`);
                renderEditor();
                
                // ETAPA 3: GATILHO DE TRANSIÇÃO AUTOMÁTICA PARA DITADO
                if (!isAutoTransitioning) {
                    isAutoTransitioning = true;
                    updateUIStatus('loading', '🚀 ETAPA 3: Ativando Ditado Contínuo...');
                    setTimeout(() => {
                        if (VoiceEngine.getCurrentPhase() === 'CONFIG') {
                            VoiceEngine.switchToGemini(); // Vai para o motor ininterrupto agora!
                        }
                    }, 1500);
                }
            }
        },

        // ETAPA 2: DITADO GEMINI
        receiveRawTranscription: async (text, isOverwrite = false) => {
            if (!text || !text.trim()) return;
            
            // Remove gatilhos de finalização visual
            let safeChunk = text.replace(/finalizar exame/gi, "").replace(/concluir relatório/gi, "").trim();
            
            if (safeChunk) {
                if (isOverwrite) {
                    // O Gemini entregou o texto MESTRE definitivo! Substitui o preview rústico.
                    docState.rawDictationBuffer = safeChunk;
                } else {
                    docState.rawDictationBuffer += safeChunk + " ";
                }
                // Renderiza novamente a tela, agora com o texto atualizado
                renderEditor();
            }
        },

        // ETAPA 3 E 4: CASCATA DE INTELIGÊNCIA FINAL
        // Agora aceita um SNAPSHOT para rodar TOTALMENTE EM MEMÓRIA sem tocar na tela (Modo Background)
        executeFinalAiRefinement: async (snapshot = null) => {
            if (isRefiningProcessActive) return; 
            isRefiningProcessActive = true; 
            
            const isBackground = snapshot !== null;
            
            if (!isBackground && btnRecord) btnRecord.disabled = true;
            updateUIStatus('loading', '⚙️ Inteligência em Background Ativa...');

            try {
                // 1. DADOS DE ENTRADA (Pega da tela se manual, pega do snapshot se background)
                const baseText = isBackground ? snapshot.templateContent : (docState.templateContent || textEditor.innerText);
                const rawSpeech = isBackground ? snapshot.rawDictationBuffer.trim() : docState.rawDictationBuffer.trim();
                const patientName = isBackground ? snapshot.patientName : docState.patientName;
                const docDate = isBackground ? snapshot.currentDate : docState.currentDate;

                console.log(`[AI Cascade] Modo Background: ${isBackground}`);
                
                let finalAnalysisText = "";

                // ETAPA 3: GROQ MERGE
                if (typeof GroqService !== 'undefined' && rawSpeech.length > 3) {
                    const merged = await GroqService.smartMerge(rawSpeech, baseText);
                    finalAnalysisText = merged || (baseText + "\n\n" + rawSpeech);
                } else {
                    finalAnalysisText = baseText + "\n\n" + rawSpeech;
                }

                // Salva no estado ativo APENAS se for Modo VISUAL
                if (!isBackground) {
                    docState.templateContent = finalAnalysisText;
                    // NOTA: Deixamos o rawDictationBuffer intacto para que o usuário veja no final do laudo o que foi transcrito!
                    renderEditor();
                }

                // CONSTRUIR TEXTO BASE PARA OPENAI (Precisa ter o cabeçalho junto para dar contexto)
                let header = "";
                if (patientName) {
                    header = `PACIENTE: ${patientName.toUpperCase()}\nDATA: ${docDate}\n\n`;
                }
                
                // Este é o texto COMPLETO enviado para a IA processar a conclusão
                const inputForOpenAI = header + finalAnalysisText;
                
                // ETAPA 4: CONCLUSÃO (OPENAI)
                updateUIStatus('loading', '🧠 Gerando Conclusão no fundo...');
                let conclusion = null;

                if (typeof OpenAIService !== 'undefined') {
                    conclusion = await OpenAIService.generateConclusion(inputForOpenAI);
                }

                // MONTAGEM FINAL DO DOCUMENTO
                let finalTotalDocument = inputForOpenAI;
                if (conclusion) {
                    const marker = "IMPRESSÃO:";
                    const upper = inputForOpenAI.toUpperCase();
                    const idx = upper.lastIndexOf(marker);

                    if (idx !== -1) {
                        finalTotalDocument = inputForOpenAI.substring(0, idx + marker.length) + "\n" + conclusion;
                    } else {
                        finalTotalDocument = inputForOpenAI + "\n\nIMPRESSÃO:\n" + conclusion;
                    }
                }

                // APLICAÇÃO DO RESULTADO
                if (isBackground) {
                    // MODO BACKGROUND: Salva direto no Histórico sem mexer na tela!
                    console.log("[Background AI] Concluído com Sucesso! Enviando direto para Histórico...");
                    if (window.triggerSilentAutoSave) {
                        window.triggerSilentAutoSave(finalTotalDocument, patientName);
                    }
                    updateUIStatus('success', '✅ Laudo Concluído e Salvo em Histórico.');
                } else {
                    // MODO VISUAL: Escreve na tela para o usuário ver.
                    textEditor.innerHTML = formatLaudoHTML(finalTotalDocument);
                    updateUIStatus('success', '✅ EXAME CONCLUÍDO.');
                    confettiVisualEffect();
                    if (window.triggerSilentAutoSave) {
                        window.triggerSilentAutoSave(textEditor.innerText, patientName);
                    }
                }

            } catch (err) {
                console.error("Falha na Cascata de IA:", err);
                updateUIStatus('error', 'Erro fatal no processamento.');
            } finally {
                isRefiningProcessActive = false; // LIBERAÇÃO CRÍTICA: Garante recuperação total após falha ou sucesso.
                if(btnRecord) btnRecord.disabled = false;
            }
        }
    };

    // --- BOOTSTRAP DO MOTOR ---
    VoiceEngine.init({
        onPhaseChange: (phase) => { currentWorkflowState = phase; },
        onStatusChange: (s, m) => { updateUIStatus(s, m); },
        onCommand: async (cmd) => {
            if (cmd.action === 'FORCE_FINISH') {
                console.log("[AutoWorkflow] Comando Final Detectado. Rodando IA Refinamento no modo Visual...");
                
                // 1. NÃO limpa a tela mais! Apenas atualiza o status visualmente.
                updateUIStatus('loading', '🚀 Processando IA (Por favor, aguarde)...');

                // 2. DISPARO DO MODO VISUAL (passando null forçamos rodar NA TELA)
                setTimeout(() => {
                    AppStages.executeFinalAiRefinement(null);
                }, 100);

            } else {
                AppStages.handleMetadataCommand(cmd);
            }
        },
        onRawTranscription: async (text, isFinalOverwrite) => {
            await AppStages.receiveRawTranscription(text, isFinalOverwrite);
        }
    });

    // --- CLIQUES DO USUÁRIO ---
    if (btnRecord) {
        btnRecord.addEventListener('click', () => {
            const phase = VoiceEngine.getCurrentPhase();
            if (phase === 'IDLE' || phase === 'OFF') {
                // Reset Total do Estado
                docState.patientName = "";
                docState.templateContent = "";
                docState.rawDictationBuffer = "";
                textEditor.innerHTML = "";
                isAutoTransitioning = false; 
                isRefiningProcessActive = false; // Libera para o próximo laudo
                VoiceEngine.startConfig();
            } else if (phase === 'CONFIG') {
                // Permite ao médico clicar no botão para FORÇAR a leitura do Gemini AGORA! (Segurança)
                updateUIStatus('loading', '⚡ Processando entrada manual...');
                VoiceEngine.commitCurrentConfig();
            } else if (phase === 'DICTATION') {
                (async () => {
                    await VoiceEngine.kill(); // Aguarda o flush final do áudio antes de rodar Groq!
                    await AppStages.executeFinalAiRefinement();
                })();
            }
        });
    }

    // --- HELPERS DE UI ---
    function formatLaudoHTML(text) {
        if (!text) return "";
        let html = text.replace(/\n/g, '<br>');
        const keywords = ["RESSONÂNCIA MAGNÉTICA", "TÉCNICA:", "ANÁLISE:", "IMPRESSÃO:", "RELATÓRIO:", "PACIENTE:", "DATA:"];
        keywords.forEach(k => {
            const r = new RegExp(`(${k})`, "gi");
            html = html.replace(r, '<b>$1</b>');
        });
        return html;
    }

    function confettiVisualEffect() {
        document.body.style.transition = "background 0.5s";
        const old = document.body.style.backgroundColor;
        document.body.style.backgroundColor = "#0f2e1e";
        setTimeout(() => { document.body.style.backgroundColor = old; }, 1000);
    }

    // --- SISTEMA DE HISTÓRICO LOCAL PERSISTENTE ---
    const btnCopy = document.getElementById('btn-copy');
    const btnSave = document.getElementById('btn-save');
    const navNew = document.getElementById('nav-new');
    const navHistory = document.getElementById('nav-history');
    
    const historyOverlay = document.getElementById('history-overlay');
    const closeHistoryBtn = document.getElementById('close-history-btn');
    const historyList = document.getElementById('history-list-container');

    function getLocalHistory() {
        try {
            const raw = localStorage.getItem('radvoice_report_history');
            return raw ? JSON.parse(raw) : [];
        } catch(e) { return []; }
    }

    function executeCoreSave(isSilent = false, overrideText = null, overridePatient = null) {
        const contentText = overrideText !== null ? overrideText : (textEditor.innerText || "");
        const finalPatient = overridePatient !== null ? overridePatient : (docState.patientName || "PACIENTE NÃO IDENTIFICADO");
        
        // Validação básica anti-lixo
        if (contentText.length < 30 || contentText.includes("Clique ou dite para começar")) {
            if(!isSilent) alert("⚠️ O laudo parece estar vazio para salvar.");
            return;
        }

        try {
            const history = getLocalHistory();
            const entry = {
                id: Date.now(),
                timestamp: new Date().toLocaleString('pt-BR'),
                patient: finalPatient,
                fullText: contentText
            };

            history.unshift(entry);
            localStorage.setItem('radvoice_report_history', JSON.stringify(history.slice(0, 50)));

            // Feedback visual sem travar o fluxo do usuário
            btnSave.innerText = "✅ SALVO AUTOMATICAMENTE!";
            setTimeout(() => btnSave.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Salvar Laudo`, 3000);

            if (!isSilent) {
                if(confirm("Laudo salvo no Histórico com SUCESSO! Deseja limpar a tela para iniciar um NOVO Laudo?")) {
                    clearSystemState();
                }
            }
        } catch(err) {
            console.error("Falha crítica ao salvar no LocalStorage:", err);
        }
    }

    function saveReportToHistory() {
        executeCoreSave(false); // Modo Manual com confirmação
    }

    // Exporta para o AppStages conseguir chamar no fundo, permitindo passar texto desacoplado da tela
    window.triggerSilentAutoSave = (textOverride, patientOverride) => executeCoreSave(true, textOverride, patientOverride);


    function openHistoryModal() {
        const list = getLocalHistory();
        historyList.innerHTML = "";

        if (list.length === 0) {
            historyList.innerHTML = `<div style="text-align:center; color:var(--text-dim); margin-top:40px; font-style:italic;">Nenhum laudo salvo no histórico ainda.</div>`;
        } else {
            list.forEach(item => {
                const div = document.createElement('div');
                div.className = "history-card";
                div.innerHTML = `
                    <div class="h-patient">${item.patient.toUpperCase()}</div>
                    <div class="h-meta">${item.timestamp}</div>
                `;
                div.onclick = () => {
                    if(confirm(`Deseja carregar o laudo de ${item.patient} na tela? O laudo atual será sobrescrito.`)) {
                        textEditor.innerHTML = formatLaudoHTML(item.fullText);
                        // Reconstitui minimamente o estado
                        docState.patientName = item.patient;
                        closeHistoryModal();
                    }
                };
                historyList.appendChild(div);
            });
        }

        historyOverlay.style.display = "flex";
        setTimeout(() => historyOverlay.classList.add('visible'), 10);
    }

    function closeHistoryModal() {
        historyOverlay.classList.remove('visible');
        setTimeout(() => historyOverlay.style.display = "none", 300);
    }

    function clearSystemState() {
        docState.patientName = "";
        docState.templateContent = "";
        docState.rawDictationBuffer = "";
        isAutoTransitioning = false; 
        isRefiningProcessActive = false; // Destrava tudo.
        textEditor.innerHTML = "Clique ou dite para começar o laudo...";
        VoiceEngine.kill();
        updateUIStatus('idle', 'Aguardando...');
    }

    // --- BINDINGS DOS EVENTOS ---

    if (btnCopy) {
        btnCopy.addEventListener('click', () => {
            const txt = textEditor.innerText || "";
            navigator.clipboard.writeText(txt).then(() => {
                const backup = btnCopy.innerText;
                btnCopy.innerText = "Copiado!";
                setTimeout(() => btnCopy.innerText = backup, 1500);
            }).catch(err => alert("Erro ao copiar para a área de transferência."));
        });
    }

    if (btnSave) {
        btnSave.addEventListener('click', saveReportToHistory);
    }

    if (navNew) {
        navNew.addEventListener('click', () => {
            if(confirm("Tem certeza que deseja começar do zero? O laudo atual será PERDIDO se não tiver sido salvo.")) {
                clearSystemState();
            }
        });
    }

    if (navHistory) {
        navHistory.addEventListener('click', openHistoryModal);
    }

    if (closeHistoryBtn) {
        closeHistoryBtn.addEventListener('click', closeHistoryModal);
    }

    // Fecha se clicar fora da modal
    window.addEventListener('click', (e) => {
        if (e.target === historyOverlay) closeHistoryModal();
    });

});
