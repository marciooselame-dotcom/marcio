const fs = require('fs');
const pdf = require('pdf-extraction');

async function check(path1, path2) {
    let b1 = fs.readFileSync(path1);
    let b2 = fs.readFileSync(path2);
    let t1 = await pdf(b1);
    let t2 = await pdf(b2);
    console.log("CONTENT1 LEN: " + t1.text.length);
    console.log("CONTENT2 LEN: " + t2.text.length);
    console.log("MATCH: " + (t1.text === t2.text));
}
check('C:\\Users\\marci\\Desktop\\IA\\laudos de pacientes reais em pdf\\11677483_9513003.pdf', 'C:\\Users\\marci\\Documents\\iLovePDF_Output\\ilovepdf-word-to-pdf\\11677483_9513003.pdf');
