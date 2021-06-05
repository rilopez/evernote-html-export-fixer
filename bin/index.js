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
    .argv;

console.log(`loading ${options.dir}`);


fs.readdir(options.dir, (err, files) => {
    const stats = { files: 0}
    files.forEach(file => {
        let resolvedPath = path.resolve(options.dir, file);
        const fileAttrs = fs.lstatSync(resolvedPath);
        if (!fileAttrs.isDirectory()) {
            console.log(`file: ${orange(resolvedPath)} `);
            const $ = cheerio.load(fs.readFileSync(resolvedPath));
            const title = $('.html-note > h1').text()
            console.log(`\t title: ${title}`);
            //TODO extract note attrs
            /*<div class="html-note">
                  <meta itemprop="title" content="PDF - www.dgb.sep.gob.mx">
                  <meta itemprop="created" content="20200207T232114Z">
                  <meta itemprop="updated" content="20200207T232114Z">
                  <note-attributes>
                    <meta itemprop="source" content="web.clip7">
                    <meta itemprop="source-url" content="https://www.dgb.sep.gob.mx/acciones-y-programas/PDF/GUIA%20DE%20ESTUDIOS%202018-2019.pdf">
                    <meta itemprop="source-application" content="webclipper.evernote">
                  </note-attributes>
             */
            //TODO verify if it has a `${resolvedPath} files` folder
            //TODO fix href absolute paths
            //TODO href paths verify if it exists
            //TODO if found a PDF . add link, move the file, same folder
            stats.files = stats.files + 1;

            //TODO call pandoc `pandoc  PDF\ -\ www.dgb.sep.gob.mx.html   -o /tmp/test2.pdf`
            //TODO add readme pandoc / latex installation
            /*
              sudo apt install pandoc
              sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra
             */

            //TODO set generated pdf file attrs to match  note attrs
            //TODO move all generated PDF files to a folder

        }
    });
    console.log(stats);
});

