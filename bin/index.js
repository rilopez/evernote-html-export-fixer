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
        describe: "the destination path used during evernote export. Evernote uses absolute paths for all img and attachment files",
        type: "string",
        default: "Z:"
    })
    .option("e", {
        alias: "pdfengines",
        describe: "comma separated pandoc pdf engines",
        type: "string",
        default: "weasyprint,pdflatex"

    })
    .option("o", {
        alias: "outputformats",
        describe: "comma separated output formats",
        type: "string",
        default: "docx,pdf,png"
    })
    .argv;

console.log('options:', options);


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

function getPdfFileName(htmlFilePathAttrs, noteProps) {
    return path.join(htmlFilePathAttrs.dir, `${noteProps.created} - ${htmlFilePathAttrs.name}.pdf`);
}
function getMdFileName(htmlFilePathAttrs, noteProps) {
    return path.join(htmlFilePathAttrs.dir, `${noteProps.created} - ${htmlFilePathAttrs.name}.md`);
}
function getPngFileName(htmlFilePathAttrs, noteProps) {
    return path.join(htmlFilePathAttrs.dir, `${noteProps.created} - ${htmlFilePathAttrs.name}.png`);
}
function getDocxFileName(htmlFilePathAttrs, noteProps) {
    return path.join(htmlFilePathAttrs.dir, `${noteProps.created} - ${htmlFilePathAttrs.name}.docx`);
}

/**
 * Converts a HTML file to PDF using panda
 * @param htmlFilePathAttrs  path.parse(htmlfileFullPath) output
 * @param htmlfileFullPath full absolute path to HTML file
 */
function createPDF(title, pdfFile, htmlFilePathAttrs, htmlfileFullPath) {
    const pandocCmd = `pandoc ${quote([htmlfileFullPath])}  -o ${quote([pdfFile])}  --metadata title=${quote([title])}`;
    const engines = options.pdfengines.split(',');
    for (const engine of engines) {
        try {
            execCommand(`${pandocCmd} --pdf-engine=${engine}`, htmlFilePathAttrs.dir);
            //const createdFormatted = DateTime.fromISO(noteProps.created).toFormat('yyyyMMddhhmm.ss');
            //execCommand(`touch  -a -m -t ${createdFormatted} ${quote([pdfFile])}`, htmlFilePathAttrs.dir);
            break
        } catch (e) {
            console.error(`not able to generate pdf file using ${engine}: ${chalk.bold(pdfFile)}`, e);
        }
    }
}

/**
 * Converts a HTML file to MD using panda
 * @param htmlFilePathAttrs  path.parse(htmlfileFullPath) output
 * @param htmlfileFullPath full absolute path to HTML file
 */
function createMD(title, mdFile, htmlFilePathAttrs, htmlfileFullPath, noteProps, pdfFile, pngFile) {
    const pandocCmd = `pandoc -f html -t markdown_github-raw_html  ${quote([htmlfileFullPath])}  -o ${quote([mdFile])}`;
    execCommand(`${pandocCmd}`, htmlFilePathAttrs.dir);
    const hasTags = noteProps.tags && noteProps.tags.length > 0;
    const markdownLink = (label, link) => {
        return `[${label}](${link})`;
    }

    const pdfLink = `${quote([markdownLink('pdf-version', path.relative(htmlFilePathAttrs.dir, pdfFile))])}`;
    execCommand(`echo ${pdfLink} >> ${quote([mdFile])}`, htmlFilePathAttrs.dir);
    const pngLink = `${quote([markdownLink('png-version', path.relative(htmlFilePathAttrs.dir, pngFile))])}`;
    execCommand(`echo ${pngLink} >> ${quote([mdFile])}`, htmlFilePathAttrs.dir);
    if (hasTags){
        const tags = `${quote(['1s/^/'+ '#' + noteProps.tags.join(' #') + '\\n/'])}`;
        execCommand(`sed -i ${tags} ${quote([mdFile])}`, htmlFilePathAttrs.dir);
    }
}


/**
 * Converts a HTML file to DOCX using panda
 * @param htmlFilePathAttrs  path.parse(htmlfileFullPath) output
 * @param htmlfileFullPath full absolute path to HTML file
 */
function createDOCX(title, docxFile, htmlFilePathAttrs, htmlfileFullPath, noteProps) {
    execCommand(
        `pandoc ${quote([htmlfileFullPath])}  -o ${quote([docxFile])}  --metadata title=${quote([title])} -V current_date=${quote([noteProps.created])}`,
        htmlFilePathAttrs.dir);
}

/**
 * Converts a HTML file to PNG using chrome
 * @param htmlFilePathAttrs  path.parse(htmlfileFullPath) output
 * @param htmlfileFullPath full absolute path to HTML file
 */
function createPNG(title, pngFile, htmlFilePathAttrs, htmlfileFullPath) {
    execCommand(
        `google-chrome-stable --headless --disable-gpu --window-size=1280,2000 --screenshot=${quote([pngFile])}  ${quote([htmlfileFullPath])}   `,
        htmlFilePathAttrs.dir);
}


function setFileProps(noteProps, pdfFile, tagProperty='Keywords') {
    const keywords = noteProps.tags ? `-${tagProperty}=${quote([noteProps.tags.join(',')])}` : '';
    execCommand(`exiftool -overwrite_original_in_place -CreateDate=${noteProps.created} -ModifyDate=${noteProps.updated}  ${keywords} ${quote([pdfFile])}`);
}

function convertOtherFormats(title, absFilePath, filePathAttrs, noteProps, statusStr) {
    const formats = options.outputformats.split(',');
    const pdfFile = getPdfFileName(filePathAttrs, noteProps);
    const pngFile = getPngFileName(filePathAttrs, noteProps);

    if (formats.includes('pdf') || formats.includes('md')) {
        const pdfNotFound = !fs.existsSync(pdfFile);
        if (pdfNotFound) {
            createPDF(title, pdfFile, filePathAttrs, absFilePath);
            setFileProps(noteProps, pdfFile);
        } else {
            console.warn(`${statusStr} skipping overwrite because previous PDF found (${pdfFile})`)
        }
    }

    if (formats.includes('png') || formats.includes('md')) {
        const pngNotFound = !fs.existsSync(pngFile);
        if (pngNotFound) {
            createPNG(title, pngFile, filePathAttrs, absFilePath);
            setFileProps(noteProps, pngFile, 'Label');
        } else {
            console.warn(`${statusStr} skipping overwrite because previous PNG found (${pngFile})`)
        }
    }

    if (formats.includes('md')) {
        const mdFile = getMdFileName(filePathAttrs, noteProps);
        const mdNotFound = !fs.existsSync(mdFile);
        if (mdNotFound) {
            createMD(title, mdFile, filePathAttrs, absFilePath, noteProps, pdfFile, pngFile);
        } else {
            console.warn(`${statusStr} skipping overwrite because previous MD found (${mdFile})`)
        }
    }

    if (formats.includes('docx')) {
        const docxFile = getDocxFileName(filePathAttrs, noteProps);
        const docxNotFound = !fs.existsSync(docxFile);
        if (docxNotFound) {
            createDOCX(title, docxFile, filePathAttrs, absFilePath, noteProps);
        } else {
            console.warn(`${statusStr} skipping overwrite because previous DOCX found (${docxFile})`)
        }
    }

}

async function processFile(statusStr, absFilePath, filePathAttrs) {
    console.log(`${statusStr} file: ${orange(absFilePath)} `);
    const $ = cheerio.load(fs.readFileSync(absFilePath));
    const noteProps = extractNoteProps($);

    //TODO do not modify html if tag pre.ril-note-props-json is found
    const $h1 = $('.html-note > h1');
    const title = $h1.text().trim()
    const filesFolder = getFilesFolderName(filePathAttrs);
    console.log(`
               title: ${title}
               filesFolder: ${filesFolder}
            `);
    if ($('.html-note pre.note-props-json').length === 0) {
        $('.html-note').append($(`<pre class="note-props-json">${JSON.stringify(noteProps, null, 4)}</pre>`));
        fixImages($);
        fixFileReferences($, 'a', 'href');
        fixPDFViewer($, filesFolder);
        fs.writeFileSync(absFilePath, $.html());
    } else {
        console.warn(`${statusStr} Skipping html fix because  pre element with class 'note-props-json' found `);
    }

    convertOtherFormats(title, absFilePath, filePathAttrs, noteProps, statusStr);

    return `${statusStr} COMPLETED`;
}

fs.readdir(options.dir, (err, allFiles) => {
    const files = allFiles.filter(f => {
        const absFilePath = path.resolve(options.dir, f);
        const filePathAttrs = path.parse(absFilePath);
        const fileAttrs = fs.lstatSync(absFilePath);
        const isHTML = filePathAttrs.ext === ".html";

        return (fileAttrs.isFile()
            && filePathAttrs.name !== 'Evernote_index'
            && isHTML
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

