/**
 * MSKKnowledge — Sistema de Correção Fonética e Léxica para Radiologia.
 */
const MSKKnowledge = (() => {
    
    // Dicionário de correção de termos médicos que a IA pode transcrever foneticamente errado
    const lexicon = {
        // Termos anatômicos/patológicos
        "meniscectomia": ["menissectomia", "menisque ctomia", "mini cectomia"],
        "condropatia": ["condopatia", "condro patia"],
        "edema ósseo": ["edema osso", "edemaocio"],
        "fibrocartilagem": ["fibro cartilagem", "fibrocartilhagem"],
        "rotura": ["ruptura"], // Opcional, padronizar para rotura em PT
        "Hoffa": ["rofa", "hoffa", "ofa"],
        "Bursite": ["bucite", "burcite"],
        "supraespinhal": ["supra espinhal", "supraespinhal", "supra-espinhal"],
        "infraespinhal": ["infra espinhal", "infra-espinhal"],
        "cisto de Baker": ["cisto de baker", "cisto de baquer"],
        "osteocondral": ["ostio condral", "osteo condral"]
    };

    function applyPhoneticCorrections(text) {
        if (!text) return "";
        
        let corrected = text;
        
        // Itera sobre o léxico para fazer substituições case-insensitive
        for (const [correctTerm, phonemes] of Object.entries(lexicon)) {
            phonemes.forEach(wrongTerm => {
                // Evita recursão infinita caso a chave esteja nos fonemas
                if(correctTerm.toLowerCase() === wrongTerm.toLowerCase()) return;

                const regex = new RegExp(`\\b${wrongTerm}\\b`, 'gi');
                corrected = corrected.replace(regex, correctTerm);
            });
        }
        
        // Ajustes gerais de maiúsculas/minúsculas em termos específicos se necessário
        corrected = corrected.replace(/\bhoffa\b/gi, 'Hoffa');
        corrected = corrected.replace(/\bbaker\b/gi, 'Baker');
        
        return corrected;
    }

    /**
     * Analisa o texto completo do ditado e separa os comandos de fluxo da transcrição clínica real.
     * Retorna os comandos encontrados e o texto limpo pronto para ser inserido.
     */
    function extractWorkflowCommands(text) {
        let remainingText = text;
        const commandsToExecute = [];

        // Faz o match em modo insensível e global
        const lower = text.toLowerCase();

        // 1. Tentar extrair "Paciente [Nome]"
        // Regex robusto que procura a palavra paciente e pega o que vem a seguir até uma vírgula, ponto ou quebra de linha
        const patientRegex = /(paciente)[:\s-]*([^,.\n]+)/i;
        const patientMatch = remainingText.match(patientRegex);
        if (patientMatch) {
            commandsToExecute.push({ 
                action: 'setPatient', 
                value: patientMatch[2].trim() 
            });
            // Remove apenas o comando e preserva o resto do áudio
            remainingText = remainingText.replace(patientMatch[0], "");
        }

        // 2. Tentar extrair "Laudo [Região]"
        const laudoRegex = /(laudo)[:\s-]*([^,.\n]+)/i;
        const laudoMatch = remainingText.match(laudoRegex);
        if (laudoMatch) {
            commandsToExecute.push({ 
                action: 'loadTemplate', 
                value: laudoMatch[2].trim() 
            });
            remainingText = remainingText.replace(laudoMatch[0], "");
        }

        // 3. Tentar extrair "Finalizar Exame"
        const finishRegex = /(finalizar exame|encerrar exame|finalizar laudo)/i;
        const finishMatch = remainingText.match(finishRegex);
        if (finishMatch) {
            commandsToExecute.push({ action: 'finishReport' });
            remainingText = remainingText.replace(finishMatch[0], "");
        }

        // 4. Limpar tela
        const clearRegex = /(apagar tudo|limpar tela)/i;
        const clearMatch = remainingText.match(clearRegex);
        if (clearMatch) {
            commandsToExecute.push({ action: 'clear' });
            remainingText = remainingText.replace(clearMatch[0], "");
        }

        // Limpeza final do lixo residual deixado pelas remoções
        remainingText = remainingText
            .replace(/^[.,;\s]+/, "") // Remove pontuação solta no início
            .replace(/\s+/g, " ")    // Normaliza espaços
            .trim();

        return {
            commands: commandsToExecute,
            dictation: remainingText
        };
    }

    return {
        applyPhoneticCorrections,
        extractWorkflowCommands
    };
})();
