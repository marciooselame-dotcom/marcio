const fs = require('fs');
const path = require('path');
const pdf = require('pdf-extraction');

const sourceDir = "C:\\Users\\marci\\Documents\\iLovePDF_Output\\ilovepdf-word-to-pdf";
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.pdf'));

async function main() {
    const reportTexts = [];
    for (const file of files) {
        try {
            let dataBuffer = fs.readFileSync(path.join(sourceDir, file));
            let data = await pdf(dataBuffer);
            let clean = data.text.replace(/\s+/g, ' ').trim();
            reportTexts.push(clean);
        } catch(e) { }
    }
    fs.writeFileSync('final_models_dump.txt', reportTexts.join("\n---FINAL_SEPARATOR---\n"), 'utf8');
    console.log("DUMP FINAL CONCLUÍDO.");
}
main().catch(console.error);
