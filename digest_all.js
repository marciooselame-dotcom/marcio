const fs = require('fs');
const path = require('path');
const pdf = require('pdf-extraction');

const sourceDir = "C:\\Users\\marci\\Desktop\\IA\\laudos de pacientes reais em pdf";
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.pdf'));

async function main() {
    console.log("Encontrados " + files.length + " laudos para digestão...");
    const reportTexts = [];
    for (const file of files) {
        try {
            let dataBuffer = fs.readFileSync(path.join(sourceDir, file));
            let data = await pdf(dataBuffer);
            let clean = data.text.replace(/\s+/g, ' ').trim();
            reportTexts.push(clean);
        } catch(e) {
            console.error("Erro no arquivo:", file);
        }
    }
    fs.writeFileSync('all_real_reports_dump.txt', reportTexts.join("\n---SEPARADOR_LAUDO---\n"), 'utf8');
    console.log("SUCESSO! Condensados em dump.");
}

main().catch(console.error);
