'use strict';
const vscode = require('vscode');
const dom = require('../mes_modules/dom-js');
const config = vscode.workspace.getConfiguration('epub');
const Window = vscode.window;
const fs = require('fs');
const path = require('path');
const problemes = require('./problemes');
const util = require('./util');
const mesMessages = require('./mesMessages');
let mesErreurs = mesMessages.mesErreurs;
let outputChannel = vscode.window.createOutputChannel('EPUB Tools');


function tdm() {
    let d = Window.activeTextEditor.document;
    if(!functionTDM._isTDM(d.fileName)){
        mesErreurs.erreurFichierTOC();
        return;
    }
    var Liens = util.fichierLiens('.xhtml');
    // console.log(problemes.problemesTitres(Liens));
    outputChannel.appendLine(problemes.problemesTitres(Liens));
    if (config.get("ancreTDM").ajouterAncre) {
        functionTDM._ajoutAncre(Liens);
    }
    functionTDM._epubTOC(Liens, d.fileName);
}

let functionTDM = {
    _isTDM: function (fichier) {
        var txt = fs.readFileSync(fichier, 'utf8');
        if (txt.indexOf('</nav>') !== -1 || txt.indexOf('</navMap') !== -1) {
            return true;
        }
        return false;
    },
    _ajoutAncre: function (liens) {
        var k = 0;
        var nomId = config.get("ancreTDM").nomAncre;
        var allID = functionTDM._recupAllID(liens);
        Object.values(liens).forEach(function (fichier) {
            var data = fs.readFileSync(fichier, 'utf8');
            var mesTitres = util.rechercheTitre(data);
            if (mesTitres) {
                mesTitres.forEach(function (titre) {
                    ++k;
                    var newID = 'id="' + nomId + '-' + k + '"';
                    while (allID.indexOf(newID) !== -1) {
                        ++k;
                        newID = 'id="' + nomId + '-' + k + '"';
                    }
                    var h = new RegExp('<h([0-9])([^>]*)>', 'ig');
                    var result = h.exec(titre);
                    if (result[2].indexOf('id') === -1) {
                        if (result[2] === "") {
                            var newtitre = titre.replace(result[1], result[1] + ' ' + newID);
                        } else {
                            newtitre = titre.replace(result[2], result[2] + ' ' + newID);
                        }

                    } else {
                        newtitre = titre;
                    }
                    data = data.replace(titre, newtitre);
                });
                fs.writeFileSync(fichier, data, 'utf8');
            }
        });

    },

    _recupAllID: function (liens) {
        var allID = [];
        Object.values(liens).forEach(function (el) {
            var data = fs.readFileSync(el, 'utf8');
            var mesId = data.match(/id="[^"]*"/gi);
            allID = mesId && allID.concat(mesId) || allID
        });
        return allID;
    },

    _epubTOC: function (liens, fichierTOC) {
        try {
            var mesLiens = functionTDM._recupSpine(),
                mesTitres = [];

            mesLiens.forEach(function (el) {
                el = path.basename(el);
                var el1 = liens[el],
                    data = fs.readFileSync(el1, 'utf8'),
                    rtitre = util.rechercheTitre(data);
                if (rtitre) {
                    var monLien = [];
                    monLien.push(el1);
                    monLien.push(rtitre);
                    mesTitres.push(monLien);
                }
            });
            functionTDM._tableMatieres(mesTitres, fichierTOC);
        } catch (error) {
            mesErreurs.erreurMessageSpine();
        }
    },

    _recupSpine: function () {
        var monOPF = util.recupFichiers('.opf')[0];
        var data = fs.readFileSync(monOPF, 'utf8');
        var monDom = new dom(data);
        var monSpine = monDom.getElementByTagName('spine');
        var idref = functionTDM._rechercheIdref(monSpine[0]);
        return functionTDM._rechercheHrefParIdRef(data, idref);

    },
    _rechercheIdref: function (texte) {
        return texte.match(/idref=(\'|").*?(\'|")/gi);
    },
    _rechercheHrefParIdRef: function (texte, idref) {
        var mesLiens = [];
        idref.forEach(function (el) {
            var id = el.replace('ref=', '='),
                exp = id + '.+?href=(\'|")(.*?)(\'|")',
                re = new RegExp(exp, 'gi'),
                val = re.exec(texte);
            mesLiens.push(val[2]);

        });
        return mesLiens;
    },

    _tableMatieres: function (titres, fichierTOC) {
        var titreTDM = config.get('titreTDM');
        var maTableXhtml = '<' + titreTDM.balise + ' class="' + titreTDM.classe + '">' + titreTDM.titre + '</' + titreTDM.balise + '>\n',
            titreAvant = 0,
            classeOL = config.get('classeTDM');
        var maTableNCX = '';
        var i = 0;
        var ltitres = titres.length,
            k = 0;
        for (; k !== ltitres; k++) {
            var el = titres[k];
            var relativeP = path.relative(path.dirname(fichierTOC), path.dirname(el[0]));
            if (relativeP !== '') {
                relativeP = relativeP + '/' + path.basename(el[0]);
            } else {
                relativeP = path.basename(el[0]);
            }

            el[1].forEach(function (titre) {
                var h = new RegExp('<h[0-9][^>]*>((?:.|\n|\r)*?)<\/h([0-9])>', 'ig'),
                    id = '';
                if (titre.indexOf('id=') !== -1) {
                    var idexp = new RegExp('id="([^"]*)"', 'gi');
                    id = '#' + idexp.exec(titre)[1];
                }
                var result = h.exec(titre);
                if (result[2] === titreAvant) {
                    maTableXhtml += '</li>\n<li>\n';

                    maTableNCX += '</navPoint>\n<navPoint id="navPoint' + i + '" playOrder="' + i + '">\n';
                } else if (result[2] < titreAvant) {
                    maTableXhtml += '</li>\n</ol>\n'.repeat(titreAvant - result[2]);
                    maTableXhtml += '</li>\n<li>\n';

                    maTableNCX += '</navPoint>\n'.repeat(titreAvant - result[2]);
                    maTableNCX += '</navPoint>\n<navPoint id="navPoint' + i + '" playOrder="' + i + '">\n';
                } else if (result[2] > titreAvant) {
                    if (titreAvant === 0) {
                        maTableXhtml += '<ol class="' + classeOL + '">\n<li>\n';
                        maTableXhtml += '<ol>\n<li>\n'.repeat(result[2] - titreAvant - 1);
                    } else {
                        maTableXhtml += '<ol>\n<li>\n'.repeat(result[2] - titreAvant);
                    }
                    maTableNCX += ('<navPoint id="navPoint' + i + '" playOrder="' + i + '">\n').repeat(result[2] - titreAvant);
                }

                if (path.basename(relativeP) === path.basename(fichierTOC)) {
                    id = "";
                }
                var monTexte = util.epureBalise(result[1]);
                maTableXhtml += '<a href="' + relativeP + id + '">';
                maTableXhtml += monTexte.toc + '</a>';

                maTableNCX += '<navLabel>\n<text>';
                maTableNCX += monTexte.txt;
                maTableNCX += '</text>\n</navLabel>\n';

                maTableNCX += '<content src="' + relativeP + id + '" />';

                titreAvant = result[2];
                i++;

            });
            if (k === ltitres - 1) {
                maTableXhtml += '</li>\n</ol>\n'.repeat(titreAvant);
                maTableNCX += '</navPoint>\n'.repeat(titreAvant);
            }
        }

        if (path.extname(fichierTOC) === '.ncx') {
            util.remplaceDansFichier(fichierTOC, maTableNCX, 'navMap');
        } else {
            util.remplaceDansFichier(fichierTOC, maTableXhtml, 'nav', 'toc');
        }

    }
}

function pagelist() {
    let d = Window.activeTextEditor.document;
    let Liens = util.recupFichiers('.xhtml'),
        pBreak = functionPageList._epubPageBreak(Liens, d.fileName);
    if (pBreak.length !== 0) {

        fs.readFile(d.fileName, 'utf8', (err, txt) => {
            if (txt.indexOf('epub:type="page-list"') !== -1) {
                util.remplaceDansFichier(d.fileName, pBreak, 'nav', 'page-list');
            } else {
                pBreak = '<nav epub:type="page-list" role="doc-pagelist">\n' + pBreak + '\n</nav>';
                // find </nav>
                if (txt.indexOf('</nav>') !== -1) {
                    var data = txt.replace(/<\/nav>/, '</nav>\n' + pBreak);
                    fs.writeFileSync(d.fileName, data);
                } else {
                    functionPageList._insertEditorSelection(pBreak);
                }
            }
        });

    } else {
        mesMessages.mesErreurs.erreurPageBreak();
        util.remplaceDansFichier(d.fileName, "", 'nav', 'page-list');
    }
}

let functionPageList = {
    _epubPageBreak: function (fichiers, fichierTOC) {
        var pageBreaks = [];
        Object.values(fichiers).forEach(function (el) {
            var relativeP = path.relative(path.dirname(fichierTOC), path.dirname(el));
            if (relativeP !== '') {
                relativeP = relativeP + '/' + path.basename(el);
            } else {
                relativeP = path.basename(el);
            }
            var txt = fs.readFileSync(el, 'utf8');
            var pb = functionPageList._recherchePageBreak(txt);
            if (pb.length !== 0) {
                pb.forEach(function (sp) {
                    pageBreaks.push({
                        page: relativeP,
                        value: sp.getAttr('title'),
                        id: sp.getAttr('id')
                    });
                });

            }
        });
        pageBreaks.sort(function (a, b) {
            return a.value - b.value;
        });
        if (pageBreaks.length !== 0) {
            var pageList = '<ol>\n';
            pageBreaks.forEach(function (el) {
                pageList += '<li><a href="' + el.page + '#' + el.id + '">' + el.value + '</a></li>\n';
            });
            pageList += '</ol>\n';
            return pageList;
        }
        return pageBreaks;
    },
    _insertEditorSelection: function (text) {
        const editor = vscode.window.activeTextEditor;
        const selections = editor.selections;
        editor.edit((editBuilder) => {
            selections.forEach((selection) => {
                editBuilder.insert(selection.active, text);
            });
        });
    },
    _recherchePageBreak: function (texte) {
        var monDom = new dom(texte),
            mesTitres = [];
        var tt = monDom.getElementByAttr('epub:type', 'pagebreak');
        mesTitres = tt && mesTitres.concat(tt) || mesTitres;
        return mesTitres;
    }

}

module.exports = {
    tdm,
    pagelist
}