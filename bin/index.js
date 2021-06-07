#!/usr/bin/env node
const quote = require('shell-quote').quote;

const cheerio = require('cheerio');
const {execSync} = require('child_process');
const path = require('path');
const chalk = require('chalk');
const yargs = require("yargs");
const {DateTime} = require("luxon");
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
    .option("e", {
        alias: "pdfengines",
        describe: "comma separated pandoc pdf engines",
        type: "string",
        default: "weasyprint,pdflatex"

    })
    .argv;

console.log(`loading ${options.dir}`);


function extractNoteProps($) {
    const metaTags = $('.html-note meta');
    let meta = {};
    for (const metaTagsKey in metaTags) {
        const tagElement = metaTags[metaTagsKey];
        if (tagElement.type !== 'tag') continue;
        let propName = $(tagElement).attr('itemprop');
        if (propName === 'tag') {
            if (!meta[propName]) {
                meta['tags'] = [];
            }
            meta['tags'].push($(tagElement).attr('content'));

        } else {
            meta[propName] = $(tagElement).attr('content');
        }

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

function execCommand(cmd, cwd) {
    console.log(`$> ${cmd}`);
    let stdout = execSync(cmd, {cwd: cwd});
    console.log(`output: ${stdout}`);
    return stdout;
}

function getPdfFileName(htmlFilePathAttrs) {
    return path.join(htmlFilePathAttrs.dir, htmlFilePathAttrs.name + '.pdf');
}

/**
 * Converts a HTML file to PDF using panda
 * @param htmlFilePathAttrs
 * @param htmlfileFullPath
 */
function createPDF(title, htmlFilePathAttrs, htmlfileFullPath, noteProps) {
    const keywords = noteProps.tags ? `-Keywords=${quote([noteProps.tags.join(',')])}` : '';
    const pdfFile = getPdfFileName(htmlFilePathAttrs);
    const pandocCmd = `pandoc ${quote([htmlfileFullPath])}  -o ${quote([pdfFile])}  --metadata title=${quote([title])}`;
    const engines= options.pdfengines.split(',');
    for (const engine of engines) {
        try {
            execCommand(`${pandocCmd} --pdf-engine=${engine}`, htmlFilePathAttrs.dir);
            //const createdFormatted = DateTime.fromISO(noteProps.created).toFormat('yyyyMMddhhmm.ss');
            //execCommand(`touch  -a -m -t ${createdFormatted} ${quote([pdfFile])}`, htmlFilePathAttrs.dir);
            execCommand(`exiftool -overwrite_original_in_place -CreateDate=${noteProps.created} -ModifyDate=${noteProps.updated}  ${keywords} ${quote([pdfFile])}`, htmlFilePathAttrs.dir);
            break
        } catch (e) {
            console.error(`not able to generate pdf file using ${engine}: ${chalk.bold(pdfFile)}`, e);
        }
    }
}

function writeFile(title, absFilePath, html, noteProps) {
    const filePathAttrs = path.parse(absFilePath);
    fs.writeFileSync(absFilePath, html);
    createPDF(title, filePathAttrs, absFilePath, noteProps);
    console.log(`file  ${absFilePath} fixed successfully`)
}

async function processFile(statusStr, absFilePath, filePathAttrs) {
    console.log(`${statusStr} file: ${orange(absFilePath)} `);
    const $ = cheerio.load(fs.readFileSync(absFilePath));
    const noteProps = extractNoteProps($);

    //TODO do not modify html if tag pre.ril-note-props-json is found
    const $h1 = $('.html-note > h1');

    $('.html-note').append($(`<pre class="ril-note-props-json">${JSON.stringify(noteProps, null, 4)}</pre>`));
    const title = $h1.text().trim()
    const filesFolder = getFilesFolderName(filePathAttrs);
    console.log(`
               title: ${title}
               filesFolder: ${filesFolder}
            `);
    fixImages($);
    fixFileReferences($, 'a', 'href');
    fixPDFViewer($, filesFolder);
    writeFile(title, absFilePath, $.html(), noteProps);
    return `${statusStr} COMPLETED`;
}

fs.readdir(options.dir, (err, allFiles) => {

    const files = allFiles.filter(f => {
        const absFilePath = path.resolve(options.dir, f);
        const filePathAttrs = path.parse(absFilePath);
        const fileAttrs = fs.lstatSync(absFilePath);
        const pdfFile = getPdfFileName(filePathAttrs);
        const isHTML = filePathAttrs.ext === ".html";
        const pdfNotFound = !fs.existsSync(pdfFile);
        return (fileAttrs.isFile()
            && filePathAttrs.name !== 'Evernote_index'
            && isHTML
            && pdfNotFound
        );
    });

    const stats = {totalFiles: files.length, filesFixed: 0};

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const absFilePath = path.resolve(options.dir, file);
        const filePathAttrs = path.parse(absFilePath)
        stats.filesFixed = stats.filesFixed + 1;
        const statusStr = chalk.bold(`[${stats.filesFixed} of ${stats.totalFiles}]`);
        processFile(statusStr, absFilePath, filePathAttrs).then(r => console.log(r));
        if (options.maxfiles !== 0 && options.maxfiles <= stats.filesFixed) {
            break
        }

    }

    console.log(stats);
});

