const fs = require('fs');
const path = require('path');
const pdf = require('pdf-extraction');
const sourceDir = "C:\\Users\\marci\\Documents\\iLovePDF_Output\\ilovepdf-word-to-pdf";
const files = fs.readdirSync(sourceDir).filter(f => f.endsWith('.pdf'));
async function main() {
    let dataBuffer = fs.readFileSync(path.join(sourceDir, files[5])); // Teste com o 6º arquivo
    let data = await pdf(dataBuffer);
    console.log("ANOTHER REAL DOCUMENT SNIPPET:");
    const analysisIndex = data.text.indexOf("ANÁLISE:");
    console.log(data.text.substring(analysisIndex, analysisIndex + 300));
}
main();
