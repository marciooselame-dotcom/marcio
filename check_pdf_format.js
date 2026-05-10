const fs = require('fs');
const path = require('path');
const pdf = require('pdf-extraction');
const sourceDir = "C:\\Users\\marci\\Documents\\iLovePDF_Output\\ilovepdf-word-to-pdf";
const file = fs.readdirSync(sourceDir).filter(f => f.endsWith('.pdf'))[0];
async function main() {
    let dataBuffer = fs.readFileSync(path.join(sourceDir, file));
    let data = await pdf(dataBuffer);
    console.log("REAL DOCUMENT SNIPPET:");
    console.log(data.text.substring(0, 1000));
}
main();
