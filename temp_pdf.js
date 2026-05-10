const fs = require('fs');
const pdf = require('pdf-parse');
let dataBuffer = fs.readFileSync('C:/Users/marci/Desktop/IA/laudos normais/joelho.pdf');
pdf(dataBuffer).then(function(data) {
    console.log('---CONTENT_START---');
    console.log(data.text);
    console.log('---CONTENT_END---');
}).catch(err => {
    console.error(err);
});
