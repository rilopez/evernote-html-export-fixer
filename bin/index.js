#!/usr/bin/env node
const cheerio = require('cheerio');
const path = require('path');
const chalk = require('chalk');
const yargs = require("yargs");
const fs = require('fs');
const orange = chalk.keyword('blue');
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

fs.readdir(options.dir, (err, files) => {
    const stats = {files: 0}

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const resolvedPath = path.resolve(options.dir, file);
        const fileAttrs = fs.lstatSync(resolvedPath);
        if (!fileAttrs.isDirectory()) {
            console.log(`file: ${orange(resolvedPath)} `);
            const $ = cheerio.load(fs.readFileSync(resolvedPath));

            const noteProps = extractNoteProps($);
            const $h1 = $('.html-note > h1');
            $(`<pre>${JSON.stringify(noteProps,null,4)}</pre>`).insertAfter($h1);
            const title = $h1.text()
            console.log(`\t title: ${title}`);

            //TODO replace meta tags with PRE tag with props in json format
            //TODO verify if it has a `${resolvedPath} files` folder
            //TODO fix href absolute paths
            //TODO href paths verify if it exists
            //TODO if found a PDF . add link, move the file, same folder



            fs.writeFile(resolvedPath, $.html(), err => {
                if (err) {
                    console.error(err)
                    return
                }
                console.log(`file  ${resolvedPath} fixed successfully` )
                //TODO call pandoc `pandoc  PDF\ -\ www.dgb.sep.gob.mx.html   -o /tmp/test2.pdf`
                //TODO add readme pandoc / latex installation
                /*
                  sudo apt install pandoc
                  sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra
                 */

                //TODO set generated pdf file attrs to match  note attrs
            });



            //TODO move all generated PDF files to a folder

            stats.files = stats.files + 1;
            if ( options.maxfiles !== 0 && options.maxfiles <= stats.files ) {
                break
            }
        }
    }

    console.log(stats);
});

