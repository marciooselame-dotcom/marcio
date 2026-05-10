const fs = require('fs');
const pdf = require('pdf-extraction');

const files = [
    'Ombro.pdf', 'QUADRIL.pdf', 'sacroccocix.pdf', 'sacroiILIACA.pdf', 'Tornozelo.pdf'
];

async function main() {
    const results = {};
    for(const file of files) {
        let dataBuffer = fs.readFileSync('./templates_pdf/' + file);
        let data = await pdf(dataBuffer);
        results[file.toLowerCase().replace('.pdf', '')] = data.text;
    }
    fs.writeFileSync('extracted_missing.json', JSON.stringify(results, null, 2), 'utf8');
    console.log('SUCCESSFULLY EXTRACTED REMAINING FILES!');
}

main().catch(console.error);
