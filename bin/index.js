#!/usr/bin/env node
const cheerio = require('cheerio');
const path = require('path');
const chalk = require('chalk');
const yargs = require("yargs");
const fs = require('fs');
const orange = chalk.keyword('green').bold;
const options = yargs
    .usage("Usage: -n <name>")
    .option("d", {
        alias: "dir",
        describe: "folder with  evernote multi-page html exports",
        type: "string",
        demandOption: true
    })
    .option("m", {
        alias: "maxfiles",
        describe: "Maximum number of files to process in directory, process all if zero",
        type: "number",
        default: 0

    })
    .option("p", {
        alias: "absprefix",
        describe: "abs directory prefix,  usually is the destiation path used during evernote export",
        type: "string",
        default: "Z:"

    })
    .argv;

console.log(`loading ${options.dir}`);


function extractNoteProps($) {
    const metaTags = $('.html-note meta');
    let meta = {};
    for (const metaTagsKey in metaTags) {
        const tag = metaTags[metaTagsKey];
        if (tag.type !== 'tag') continue;
        meta[$(tag).attr('itemprop')] = $(tag).attr('content');
    }
    return meta;
}

function getFilesFolderName(fileAttrs) {
    const filesFolder = path.join(fileAttrs.dir, fileAttrs.name + ' files')
    if (fs.existsSync(filesFolder)) {
        return filesFolder;
    } else {
        console.log(`file folders not found: ${filesFolder}`);
    }
    return undefined;
}

function fixFileReferences($, tagName = 'img', refAttrName = 'src') {
    const tags = $(tagName);
    let fixedCounter = 0;
    for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        let ref = $(tag).attr(refAttrName);
        if (ref && ref.startsWith(options.absprefix)) {
            ref = ref.replace(options.absprefix, '.').replace(/\\/g, '/');
            //TODO href paths verify if it exists
            $(tag).attr(refAttrName, ref);
            fixedCounter++;
        }
    }
    console.log(`total ${tagName} : ${tags.length}, fixed: ${fixedCounter}`);
    return $;
}


function fixImages($) {
    fixFileReferences($, 'img', 'src');
    const tags = $('img');
    let fixedCounter = 0;
    for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];
        const width = $(tag).attr('width');
        const src = $(tag).attr('src');
        if (src && !src.startsWith('data:image') && (!width || width === 'auto')) {
            $(tag).attr('width', '100%');
            fixedCounter++;
            console.log(`img ${src} width fixed from "${width}" to 100%`);
        }
    }
}

/**
 *if found a PDF . add link, move the file, same folder
 *  evernote does not link  pdfs, just add a div with the PDF name, we need to wrap this with an anchor and add the files folder name
 */
function fixPDFViewer($, filesFolder) {
    const pdfIcon = $('div[data-type="application/pdf"] svg')[0];
    if (pdfIcon && pdfIcon.next) {
        const divWithPdfText = pdfIcon.next;
        const pdfFileName = $(divWithPdfText).text();
        if (pdfFileName) {
            console.log(`FOUND PDF ${pdfFileName}`);
            let pdfAbsPath = path.join(filesFolder, pdfFileName);
            if (fs.existsSync(pdfAbsPath)) {
                const pdfPath = path.relative(options.dir, pdfAbsPath);
                $(divWithPdfText).replaceWith($(`<a href="${pdfPath}"> ${pdfFileName}</a>`))
            }
        }
    }
}

function writeFile(absFilePath, html) {
    fs.writeFileSync(absFilePath, html);
    console.log(`file  ${absFilePath} fixed successfully`)
    //TODO call pandoc `pandoc  PDF\ -\ www.dgb.sep.gob.mx.html   -o /tmp/test2.pdf`
    //TODO add readme pandoc / latex installation
    /*
      sudo apt install pandoc
      sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra
     */

    //TODO set generated pdf file attrs to match  note attrs

}

fs.readdir(options.dir, (err, files) => {
    const stats = {files: 0}

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const absFilePath = path.resolve(options.dir, file);
        const filePathAttrs = path.parse(absFilePath)
        const fileAttrs = fs.lstatSync(absFilePath);
        if (!fileAttrs.isDirectory()) {
            console.log(`file: ${orange(absFilePath)} `);
            const $ = cheerio.load(fs.readFileSync(absFilePath));
            const noteProps = extractNoteProps($);
            const $h1 = $('.html-note > h1');
            $(`<pre>${JSON.stringify(noteProps, null, 4)}</pre>`).insertAfter($h1);
            const title = $h1.text().trim()
            const filesFolder = getFilesFolderName(filePathAttrs);
            console.log(`
               title: ${title}
               filesFolder: ${filesFolder}
            `);

            fixImages($);
            fixFileReferences($, 'a', 'href');
            fixPDFViewer($, filesFolder);
            writeFile(absFilePath, $.html());
            //TODO move all generated PDF files to a folder
            stats.files = stats.files + 1;
            if (options.maxfiles !== 0 && options.maxfiles <= stats.files) {
                break
            }
        }
    }

    console.log(stats);
});

