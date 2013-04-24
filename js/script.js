/*
Main script for Wasabi web app (for visualisation and analysis of multiple sequence alignment data). 
Andres Veidenberg 2011 (andres.veidenberg@helsinki.fi)
*/

var sequences = {}; //seq. data {name : [s,e,q]}
var treesvg = {}; //phylogenetic nodetree
var leafnodes = {}; //all leafnodes+visible ancestral leafnodes
var colstep = 1000; //sequence rendering tile size
var rowstep = 100;
var letters = '-_.:?!*=AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'.split('');
var alphabet = {protein:['A','R','N','D','C','Q','E','G','H','I','L','K','M','F','P','S','T','W','Y','V','B','Z','X'],
dna:['A','T','G','C','N','X'], rna:['A','G','C','U','N','X'], gaps: ['-','_','.',':','?','!','*','='], codons:{TTT:'F', TTC:'F', TTA:'L', TTG:'L', CTT:'L', CTC:'L', CTA:'L', CTG:'L', ATT:'I', ATC:'I', ATA:'I', ATG:'M', GTT:'V', GTC:'V', GTA:'V', GTG:'V', TCT:'S', TCC:'S', TCA:'S', TCG:'S', CCT:'P',CCC:'P',CCA:'P',CCG:'P', ACT:'T',ACC:'T',ACA:'T',ACG:'T', GCT:'A', GCC:'A',GCA:'A', GCG:'A', TAT:'Y', TAC:'Y', TAA:'*',TAG:'*', CAT:'H',CAC:'H', CAA:'Q',CAG:'Q', AAT:'N',AAC:'N', AAA:'K',AAG:'K', GAT:'D', GAC:'D', GAA:'E',GAG:'E', TGT:'C',TGC:'C', TGA:'*', TGG:'W', CGT:'R',CGC:'R',CGA:'R',CGG:'R', AGT:'S',AGC:'S', AGA:'R', AGG:'R', GGT:'G', GGC:'G', GGA:'G', GGG:'G'}};
var colors = {};
var symbols = {};
var canvassymbols = {'_':'-','.':'+',':':'+','!':'?','=':'*'}; //canvas masks
var canvaslabels = {'-':'gap','_':'gap','.':'ins.',':':'ins.','?':'unkn.','!':'unkn.','*':'stop','=':'stop'};
var activeid = false;
var canvaspos = []; //list of rendered seq. tiles
var colflags = []; //(selection-)flagged columns
var rowflags = [];
var selections = [];
var maskedcols = []; //array of columns masked via sequence menu
var filescontent = {}; //temporary file data for import/export
var filetypes = {};
var exportedseq = '';
var exportedtree = '';
var dom = {}; //global references to DOM elemets

var jobdataopt = { //dataobject+properties for server sync
	key: function(item){ return ko.utils.unwrapObservable(item.id); },
	create: function(args){ return new jobmodel(args.data); }
};
var analysdataopt = {
	key: function(item){ return ko.utils.unwrapObservable(item.id); },
	create: function(args){ return new analysmodel(args.data); },
};
var serverdata = {jobdata:ko.mapping.fromJS([],jobdataopt),analysdata:ko.mapping.fromJS([],analysdataopt),importdata:ko.mapping.fromJS({})};


function parentid(id){ //extract parent dir from a library dir
	if(!id) return '';
	var idend = id.lastIndexOf('/children/');
	return ~idend? id.substring(0,idend) : '';
}

function sortdata(data,key){ //sort serverdata object arrays
	var itemsarray = typeof(data)=='string'? serverdata[data]() : data;
	itemsarray.sort(function(a,b){ return a[key]&&b[key]? a[key]()>b[key]()?1:-1 : 0; });
	return itemsarray;
}

var is = { //browser detection
	ff : Boolean($.browser.mozilla),
	chrome: Boolean(window.chrome),
	safari: Boolean($.browser.webkit && !Boolean(window.chrome)),
	ie: Boolean($.browser.msie),
	opera: Boolean($.browser.opera),
	ver: parseInt($.browser.version)
}

/* KnockOut data models to keep the state of the system */
//file export settings (export window)
var myExport = function(){
	var self = this;
	self.category = ko.observable({name:'',formats:[{name:''}]});
	self.format = ko.observable({});
	self.format.subscribe(function(f){ if(f.name=='HSAML') self.incltree(true); });
	self.variant = ko.observable({});
	self.infolink = ko.computed(function(){ return self.variant().url?'window.open(\''+self.variant().url+'\')':false });
	self.filename = ko.observable('Untitled');
	self.fileext = ko.observable('.fa');
	self.fileurl = ko.observable('');
	self.incltree = ko.observable(false);
	self.inclancestral = ko.observable(false);
	self.inclhidden = ko.observable(true);
	self.interlaced = ko.observable(false);
	self.maskoptions = ['lowercase','N','X'];
	self.masksymbol = ko.observable('lowercase');
	//Save window preferences
	self.savetargets = ko.observableArray([{name:'overwrite of current',type:'overwrite'},{name:'a new',type:'new'},{name:'branch of current',type:'child'},{name:'branch of parent',type:'sibling'}]);
	self.savetarget = ko.observable(self.savetargets()[1]);
	self.savename = ko.observable('Untitled');
}
var exportmodel = new myExport();

//ensembl import settings
var myEnsembl = function(){
	var self = this;
	self.idformats = [{name:'Gene',url:'homology',example:'ENSG00000198125'},{name:'GeneTree',url:'genetree',example:'ENSGT00390000003602'}];
	self.idformat = ko.observable(self.idformats[1]);
	self.ensid = ko.observable('');
	self.seqtype = ko.observable('protein');
	self.homtype = ko.observable('all');
	self.aligned = ko.observable(true);
	self.target = ko.observable('');
	self.idspecies = ko.observable('');
	self.idname = ko.observable('');
}
var ensemblmodel = new myEnsembl();

//global settings
var mySettings = function(){
	var self = this;
	self.toggle = function(obsvalue){ obsvalue(!obsvalue()); }
	self.btntxt = function(obsvalue){ return obsvalue()?'ON':'OFF'; }
	self.preflist = ['tooltipclass','undolength','autosave','autosaveint','onlaunch','colorscheme', 'windowanim','allanim','hidebar','skipversion'];
	self.saveprefs = function(){ //store preferences to harddisk
		$.each(self.preflist,function(p,pref){ if(self[pref]) localStorage[pref] = JSON.stringify(self[pref]()); });
	};
	self.loadprefs = function(){
		$.each(self.preflist,function(p,pref){
			if(localStorage[pref]){
				try{ var prefval = JSON.parse(localStorage[pref]); }catch(e){}
				if(typeof(prefval)!='undefined') self[pref](prefval);
			}
		});
	};
	self.tooltipclasses = ['white','black','beige'];
	self.tooltipclass = ko.observable('white');
	self.undolength = ko.observable(5);
	self.storeundo = false;
	self.autosave = ko.observable(false);
	self.autosaveopt = ['modification','minute','5 minutes','15 minutes','30 minutes'];
	self.autosaveint = ko.observable();
	self.intervalid = 0;
	self.autosave.subscribe(function(val){ //set up autosave
		clearInterval(self.intervalid);
		if(val && self.autosaveint()){
			if(exportmodel.savename()=='Untitled') exportmodel.savename('Autosaved session');
			if(~self.autosaveint().indexOf('minute')){
				var int = parseInt(self.autosaveint());
				if(isNaN(int)) int = 1;
				self.intervalid = setInterval(savefile,int*60000);
			} else { savefile(); self.storeundo = true; }
		} else self.storeundo = false;
	});
	self.keepid = false;
	self.launchopt = ['blank page','import dialog','demo data','last Library item','last session'];
	self.onlaunch = ko.observable(self.launchopt[2]);
	self.onlaunch.subscribe(function(val){
		if(~val.indexOf('last')){
			if(val=='last session'){
				self.autosaveint(self.autosaveopt[0]);
				self.autosave(true);
			}
			self.keepid = true;
		} else self.keepid = false;
	});
	self.keepzoom = ko.observable(true);
	self.keepzoom.subscribe(function(val){ if(val) localStorage.zoomlevel = JSON.stringify(model.zoomlevel()); });
	self.update = ko.observable(true);
	self.coloropt = ko.observableArray(['Taylor','Clustal','Zappo','hydrophobicity','rainbow','greyscale','custom']);
	self.coloropt.subscribe(function(val){ self.colorscheme(val[0]); });
	self.colordesc = {rainbow:'Generates even-spaced vibrant colours.', greyscale:'Generates even-spaced greyscale tones.', custom:'Customize the tones of current colourscheme.', nucleotides:'Default colouring.'};
	self.colordesc.Taylor = self.colordesc.Clustal = self.colordesc.Zappo = self.colordesc.hydrophobicity ='One of commonly used colour schemes.';
	self.colorscheme = ko.observable(self.coloropt[0]);
	self.remakecolors = ko.computed(function(){
		var colscheme = self.colorscheme();
		if(!$('#settings').length||colscheme=='custom'||(colscheme=='nucleotides'&&!model.isdna())) return;
		makeColors();
		canvaspos = [];
		makeImage('','cleanup');
		return true;
	}).extend({throttle:500});
	self.roundcorners = ko.observable(false);
	self.font = ko.observable('Courier');
	self.allanim = ko.observable(true);
	self.allanim.subscribe(function(val){
		if(val){ $('body').removeClass('notransition'); $.fx.off = false; }
		else{ self.windowanim(val); $('body').addClass('notransition'); $.fx.off = true; }
	});
	self.windowanim = ko.observable(true);
	self.windowanim.subscribe(function(val){ if(val) self.allanim(val); });
	self.hidebar = ko.observable(false);
	self.skipversion = ko.observable(0);
}
var settingsmodel = new mySettings();

//main datamodel
var myModel = function(){
	var self = this;
	//system status
	self.offline = ko.observable(false);
	self.version = {local:130409, remote:ko.observable(0), lastchange:''};
	//rendering parameters
	self.zoomlevel = ko.observable(10);
	self.zoomlevel.subscribe(function(val){ if(settingsmodel.keepzoom()) localStorage.zoomlevel = JSON.stringify(val); });
	self.zoomperc = ko.computed(function(){ var l = self.zoomlevel(); return l==2 ? 'MIN' : l==20 ? 'MAX' : l*5+'%'; });
	self.symbolw = ko.observable(1);
	self.boxw = ko.computed(function(){ return parseInt(self.zoomlevel()*self.symbolw()*1.5); });
	self.boxh = ko.computed(function(){ return parseInt(self.zoomlevel()*2); });
	self.fontsize = ko.computed(function(){ return parseInt(self.zoomlevel()*1.8); });
	self.dendogram = ko.observable(false);
	//current data
	self.currentid = ko.observable('');
	self.currentanalys = ko.computed(function(){
		var analysdata = self.currentid()? ko.utils.arrayFirst(self.sortedanalys(),function(item){return item.id()==self.currentid()}) : false;
		var analysname = analysdata? analysdata.name() : 'Untitled';
		exportmodel.savename(analysname);
		return analysdata;
	});
	self.unsaved = ko.observable(false);
	self.visiblecols = ko.observableArray();
	self.visiblerows = ko.observableArray();
	self.parentid = ko.computed(function(){ return parentid(self.currentid()) });
	self.parentid.subscribe(function(pid){ //id=>change save options
		if(self.currentid()){
			var tind = 0;
			exportmodel.savetargets.remove(function(item){ return item.type=='sibling' });
			if(pid) exportmodel.savetargets.push({name:'branch of parent',type:'sibling'});
		}
		else var tind = 1;
		exportmodel.savetarget(exportmodel.savetargets()[tind]);
	});
	self.libdir = ko.observable('Main directory');
	self.seqtype = ko.observable('');
	self.seqtype.subscribe(function(val){
		if(val=='codons') self.symbolw(3); else self.symbolw(1);
		if(val=='dna'||val=='rna'){
			self.gaprate(0.025); self.gapext(0.75); self.isdna(true);
			settingsmodel.coloropt(['nucleotides','rainbow','greyscale','custom']);
		} else {
			self.gaprate(0.005); self.gapext(0.5); self.isdna(false);
			settingsmodel.coloropt(['Taylor','Clustal','Zappo','hydrophobicity','rainbow','greyscale','custom']);
		}
	});
	self.isdna = ko.observable(false);
	self.hasdot = ko.observable(false);
	self.hasdot.subscribe(function(v){
		var label = v? 'del.' : 'gap';
		canvaslabels['-'] = label; canvaslabels['_'] = label;
	});
	//sequence + tree statistics (info window)
	self.maxseqlen = ko.observable(0);
	self.maxseqlength = ko.computed(function(){ return numbertosize(self.maxseqlen(),self.seqtype()) });
	self.minseqlen = ko.observable(0);
	self.minseqlength = ko.computed(function(){
		var seqt = self.seqtype(), unit = seqt=='dna'||seqt=='rna'? seqt : '';
		return numbertosize(self.minseqlen(),unit);
	});
	self.totalseqlen = ko.observable(0);
	self.totalseqlength = ko.computed(function(){ return numbertosize(self.totalseqlen(),self.seqtype()) });
	self.alignlen = ko.observable(0);
	self.alignlength = ko.computed(function(){ return numbertosize(self.alignlen()) });
	self.alignheight = ko.computed(function(){ return self.visiblerows().length }).extend({throttle: 100});
	self.seqcount = ko.observable(0);
	self.leafcount = ko.observable(0);
	self.nodecount = ko.observable(0);
	self.hiddenlen = ko.computed(function(){ return self.alignlen()-self.visiblecols().length; }).extend({throttle: 100});
	self.hiddenlength = ko.computed(function(){ return numbertosize(self.hiddenlen(),self.seqtype()) });
	self.treesource = ko.observable('');
	self.seqsource = ko.observable('');
	self.sourcetype = ko.observable('');
	self.ensinfo = ko.observable({});
	//button menus
	self.selmodes = ['default','columns','rows'];
	self.selmode = ko.observable(self.selmodes[0]);
	self.setmode = function(mode){ self.selmode(mode); togglemenu('selectmodemenu','hide'); toggleselection(mode); };
	self.filemenu = ko.computed(function(){
		var online = !self.offline(), data = self.seqsource()||self.treesource(), menuarr =[];
		if(online) menuarr.push('library');
		menuarr.push('import');
		if(data) menuarr.push('export');
		if(data && online) menuarr.push('save');
		if(data) menuarr.push('info'); 
		return menuarr;
	});
	self.runmenu = [{txt:'Align seq.',act:'align',icn:'icon_prank',inf:'(Re)align current sequence data'}];
	self.toolsmenu = ko.computed(function(){
		var menuarr = [];
		if(self.seqsource()) menuarr.push({txt:'Hide gaps',act:'seqtool',icn:'seq',inf:'Collapse sequence columns'});
		if(self.treesource()) menuarr.push({txt:'Prune tree',act:'treetool',icn:'tree',inf:'Prune/hide tree leafs'});
		menuarr.push({txt:'Preferences',act:'settings',icn:'settings',inf:'General preferences'});
		return menuarr;
	});
	self.menuclick = function(menu,action){ dialog(action); togglemenu(menu,'hide'); };
	//alignment parameteres (alignment window)
	self.gaprate = ko.observable(0.005);
	self.gapext = ko.observable(0.5);
	//alignment jobs tracking (status window)
	self.jobtimer = '';
	//notifications
	self.treealtered = ko.observable(false);
	self.update = ko.computed(function(){
		return self.version.local<self.version.remote() && settingsmodel.skipversion()!=self.version.remote();
	});
	self.notifications = ko.computed(function(){ return self.treealtered()||self.update(); });
	self.statusbtn = ko.computed(function(){ //notifications button
		var msgarr = [], running = 0, ready = 0, str = '';
		if(self.treealtered()) msgarr.push({short:'<span style="color:red">Realign</span>', long:'<span style="color:red">Realign needed</span>'});
		$.each(serverdata.jobdata(),function(i,job){
			if(job.status()=='running') running++;
			else if(!job.imported()) ready++;
		});
		if(running||ready){
			running = running? '<span class="nr red">'+running+'</span>' : '';
			ready = ready? '<span class="nr green">'+ready+'</span>' : '';
			msgarr.push({short:running+' '+ready, long:'Jobs'+(running?' running '+running:'')+(ready?' ready '+ready:'')});
			
			if(running){ //update running jobs status
				if(self.jobtimer) clearTimeout(self.jobtimer);
				self.jobtimer = setTimeout(function(){ communicate('alignstatus','','jobdata'); },4000);
			}
		}
		if(self.update()){
			msgarr.push({short:'<span class="green">Update</span>',long:'<span class="green">Update Wasabi</span>'});
		}
		if(msgarr.length>1){ //build notifications summary
			str = msgarr[0].short;
			for(var m=1;m<msgarr.length;m++) str += '<span class="btnsection">'+msgarr[m].short+'</span>';
		} else if (msgarr.length) str = msgarr[0].long; 
		
		if(!msgarr.length && $("#jobstatus").length) setTimeout(function(){$("#jobstatus img.closebtn").click()},500); //close empty status window
		return str;
	}).extend({throttle: 200});
	//analyses library
	self.sortanalysopt = [{t:'Name',v:'name'},{t:'Analysis ID',v:'id'},{t:'Start date',v:'starttime'},{t:'Last opened',v:'imported'},{t:'Last saved',v:'savetime'}];
	self.sortanalysby = ko.observable('starttime');
	self.sortedanalys = ko.computed(function(){
		return sortdata('analysdata',self.sortanalysby());
	}).extend({throttle:500});
	self.additem = function(div){ if($(div).hasClass('itemdiv')) $(div).hide().fadeIn(800); };
	self.removeitem = function(div){ $(div).remove(); };
	//undo stack
	self.undostack = ko.observableArray();
	self.treesnapshot = '';
	self.dnasource = ko.observable({});
	self.nodnasource = ko.computed(function(){ return $.isEmptyObject(self.dnasource()) });
	self.activeundo = {name:ko.observableArray(), undone:ko.observable(''), data:ko.observable('')};
	self.refreshundo = function(data,redo){
		if(!self.undostack().length){
			self.activeundo.name.removeAll(); 
			self.activeundo.data('');
		} else {
			if(!data) data = self.undostack()[0];
			var name = data.name.length>8? data.name.split(' ')[0] : data.name;
			if(redo) self.activeundo.name()[0].name(name);
			else { self.activeundo.name.removeAll(); self.activeundo.name.push({name:ko.observable(name)}); }
			self.activeundo.undone(false);
			self.activeundo.data(data);
		}
	};
	self.selectundo = function(data){
		if(data==='firsttree') data = self.gettreeundo('first');
		self.refreshundo(data,'select');
	};
	self.addundo = function(undodata,redo){
		if(undodata.type=='tree'&&undodata.info.indexOf('also')==-1) undodata.info += ' Undo also reverts any newer tree changes above.';
		self.undostack.unshift(undodata);
		if(self.undostack().length>settingsmodel.undolength()) self.undostack.pop();
		self.refreshundo(undodata,redo);
		model.unsaved(true);
		if(settingsmodel.storeundo) savefile();
	};
	self.undo = function(){
		var undone = self.activeundo.undone;
		var data = self.activeundo.data();
		if(!data||undone()) return;
		if(data.type=='tree'){
			var undoindex = self.undostack.indexOf(data);
			var restore = data===self.gettreeundo('first')? self.treesnapshot : (self.gettreeundo('prev',undoindex).data || self.treesnapshot);
			treesvg.loaddata(restore);
			self.gettreeundo('remove',undoindex);
		}
		else if(data.type=='seq') undoseq(data.data, data.undoaction);
		self.undostack.remove(data);
		undone(true); model.unsaved(true);
		if(settingsmodel.storeundo) savefile();
	};
	self.redo = function(){
		var undone = self.activeundo.undone;
		var data = self.activeundo.data();
		if(!data||!undone()) return;
		if(data.type=='tree') treesvg.loaddata(data.data);
		else if(data.type=='seq') undoseq(data.data, data.redoaction);
		self.addundo(data,'redo'); model.unsaved(true);
		if(settingsmodel.storeundo) savefile();
	};
	self.gettreeundo = function(mode,index){
		var start = mode=='prev'? index+1 : 0;
		var end = mode=='remove'? index : self.undostack().length-1;
		var found = false;
		for(var i=end;i>=start;i--){
			if(self.undostack()[i].type=='tree'){
				found = self.undostack()[i];
				if(mode=='first') break;
				if(mode=='remove') self.undostack.splice(i,1);
			} 
		}
		return found;
	};
};//myModel
var model = new myModel();

exportmodel.categories = ko.computed(function(){
	var catarr = [];
	if(model.seqsource()) catarr.push({name:'Sequence', formats:[{name:'fasta', variants:[{name:'fasta', ext:['.fa']} ]} ]}); 
	if(model.treesource()) catarr.push({name:'Tree', formats:[ 
		{name:'newick', variants:[
			{name:'newick', ext:['.nwk','.tre','.tree']},
			{name:'extended newick', ext:['.nhx'], desc:'Newick format with additional metadata (hidden nodes etc.)'}
		]} 
	]});
	if(catarr.length==2) catarr.push({name:'Sequence+tree', formats:[{name:'HSAML', variants:[{name:'HSAML', ext:['.xml'], desc:'XML format which supports additional data from PRANK alingments. Click for more info.', url:'http://www.ebi.ac.uk/goldman-srv/hsaml'} ]} ]});
	return catarr;
	//{name:'Phylip',fileext:'.phy',desc:'',interlace:true}, {name:'PAML',fileext:'.phy',desc:'Phylip format optimized for PAML',hastree:false,interlace:false}, {name:'RAxML',fileext:'.phy',desc:'Phylip format optimized for RAxML',hastree:false,interlace:false};
});

//Datamodel for seq. tools (hiding cols)
var myTools = function(){
	var self = this;
	self.hidelimit = ko.observable(5);
	self.hidelimitperc = ko.computed(function(){
		var limit = self.hidelimit(), rowc = model.visiblerows().length||limit;
		if(limit<0) self.hidelimit(0); else if(limit>rowc) self.hidelimit(rowc);
		return parseInt(limit/rowc*100);
	}).extend({throttle:100});
	self.slider = {w:250,offset:60,slider:{css:function(){return 60}}};
	self.sliderpos = ko.computed(function(){ //sync input=>slider
		var pos = parseInt((self.hidelimitperc()/100*self.slider.w)+self.slider.offset), cinp = $("#hidecolinp");
		return cinp.length&&cinp.is(":focus")? pos+'px' : self.slider.slider.css('left');
	}).extend({throttle:200});
	self.gapcount = [];
	self.gaptype = ko.observable('');
	self.gaptype.subscribe(function(){ self.countgaps(); });
	self.countgaps = function(){ //setup: count gaps in alignment columns
		var l = '', gaps = [];
		if(!model.hasdot()||~self.gaptype().indexOf('in')) gaps.push('.',':');
		if(!model.hasdot()||~self.gaptype().indexOf('del')) gaps.push('-','_');
		self.gapcount = [];
		$.each(model.visiblerows(),function(n,name){
			$.each(model.visiblecols(),function(i,c){
				l = sequences[name][c];
				if(i == self.gapcount.length) self.gapcount.push(0);
				if(~gaps.indexOf(l)) self.gapcount[i]++;
			});
		});
		var sliderline = $('#seqtool .draggerline');
		self.slider.slider = sliderline.length? $('.dragger',sliderline) : self.slider.slider;
		self.slider.w = sliderline.length? sliderline.width() : self.slider.w;
		self.slider.offset = sliderline.length? sliderline.position().left-17 : self.slider.offset;
		$("#hidecolinp").focus();
		self.hidelimit.valueHasMutated();
		setTimeout(function(){ $("#hidecolinp").blur() },500);
	};
	self.gaplen = ko.observable(0);
	self.buflen = ko.observable(0);
	self.hidecolcount = ko.computed(function(){ //preview result
		var colestimate = 0, rows = model.visiblerows().length, threshold = self.hidelimit(), range = [], ranges = [], dialog = $('#seqtool').length;
		var minlen = parseInt(self.gaplen()), buflen = parseInt(self.buflen());
		if(minlen<0){ minlen=0; self.gaplen(0); }
		if(buflen<0){ buflen=0; self.buflen(0); }else if(minlen<buflen*2){ buflen = parseInt((minlen-1)/2); self.buflen(buflen); }
		var processrange = function(c){
			range[1] = c; var rangespan = range[1]-range[0];
			if(rangespan>minlen){ range[0]+=buflen; range[1]-=buflen; ranges.push(range); colestimate += rangespan-(2*buflen); }
			range = [];
		};
		$.each(self.gapcount,function(c,gaps){
			if(rows-gaps<threshold){ if(!range.length) range[0] = c; }
			else if(range.length) processrange(c);
		});
		if(range.length) processrange(self.gapcount.length);
		if(dialog){ //preview, mark columns
			setTimeout(function(){
				colflags = []; clearselection(); if(model.selmode()!='columns') model.selmode('columns');
				$.each(ranges,function(i,carr){ selectionsize('','',carr); for(var r=carr[0];r<carr[1];r++){ colflags[r] = 1; }});
			}, 100);
		}
		return colestimate;
	}).extend({throttle:500});
	self.hidecolperc = ko.computed(function(){ return parseInt(self.hidecolcount()/self.gapcount.length*100) });
	self.hidecols = function(){};
	
	self.prunemode = false;
	self.leafaction = ko.observable();
	self.leafsel = ko.observable();
	self.markLeafs = function(unmark){
		if(unmark){ $.each(leafnodes,function(n,node){ if(node.active) node.highlight(false); }); return; }
		registerselections();
		$.each(model.visiblerows(),function(r,name){ if(rowflags[r]&&leafnodes[name]) leafnodes[name].highlight(true); });
	};
	self.processLeafs = function(func,affected){ //hide/remove all marked/unmarked leafs
		if(!func){
			var markedcount = $('#names tspan[fill=orange]').length;
			var target = self.leafsel()=='unmarked'? false : true;
			var affected = target? markedcount : model.visiblerows().length-markedcount;
			var func = self.leafaction()=='prune'? 'remove':'hideToggle';
			if(!affected || model.visiblerows().length-affected<4){
				var errtxt = func=='remove'? 'Can\'t prune: ':'Can\'t hide: ';
				errtxt += !affected? 'nothing to '+self.leafaction()+'.' : 'less than 4 leafs would remain.';
				$('#treetoolerror').text(errtxt);
				setTimeout(function(){$('#treetoolerror').empty()},3000); return;
			}
		} else var target = true; //process premarked leafs
		if(!model.treesnapshot) model.treesnapshot = treesvg.data.root.removeAnc().write('tags');
		$.each(leafnodes,function(n,node){ if(node.active==target) node[func]('hide','nocount'); });
		treesvg.refresh();
		var actdesc = func=='remove'? 'removed' : 'hidden', actname = func=='remove'? 'Remove' : 'Hide';
		model.addundo({name:actname+' leafs',type:'tree',data:treesvg.data.root.removeAnc().write('tags'),info:affected+' leafs were '+actdesc+'.'});
		if($('#treetool').length) $("#treetool img.closebtn").click();
	};
};
var toolsmodel = new myTools();

//HTML element transitions when viewmodel data changes
ko.bindingHandlers.fadevisible = {
	init: function(element){ $(element).css('display','none') },
    update: function(element, value){
        var value = ko.utils.unwrapObservable(value());
        if(value) $(element).fadeIn(); else $(element).hide();
    }
};
ko.bindingHandlers.slidevisible = {
	init: function(element){ $(element).css('display','none') },
    update: function(element, value){
        var value = ko.utils.unwrapObservable(value());
        if(value) $(element).slideDown(); else $(element).slideUp();
    }
};
ko.bindingHandlers.fadeText = {
    update: function(element, valueAccessor){
  		$(element).hide();
        ko.bindingHandlers.text.update(element, valueAccessor);
        $(element).fadeIn(200);
    }        
};
var slideadd = function(el){ $(el).css('display','none'); $(el).slideDown() };
var slideremove = function(el){ $(el).slideUp(400,function(){ $(this).remove() }) };
var marginadd = function(elarr){ setTimeout(function(){ elarr[0].style.marginTop=0 },50); };
var waitremove = function(el){ setTimeout(function(){ $(el).remove() },500) };

//HTML rendering for running jobs (jobstatus window)
var jobmodel = function(data){
	ko.mapping.fromJS(data, {}, this);
	var btnhtml = function(action,name,style,title,sclass){ return '<a class="button itembtn '+(sclass||'')+'" style="'+(style||'')+'" title="'+(title||'')+'" onclick="'+action+';return false;">'+name+'</a>'; };
	
	this.html = ko.computed(function(){
		var idindex = this.id().lastIndexOf('/');
		var shortid = idindex!=-1? this.id().substring(idindex+1) : this.id(); 
    	if(this.imported()){ return 'Files from job '+shortid+'<br>have been imported. '+btnhtml('dialog(\'library\')','Library','top:3px'); }
        var status = this.status();
        var btn = '';
		if(status!='running'){
			if(status=='0' && this.outfile()){
				status = 'ready to import';
				btn = btnhtml('getfile(\''+this.outfile()+'\',this,\''+this.id()+'\')','Open','','Open '+this.outfile());
			}else{ //alignment job failed
				var err = ((status!='0')?'Exit code '+status+'. ':'')+((!this.outfile())?'No result file. ':'')+' Check log for details.';
				status = '<span style="color:red">Failed. </span><img class="icn" src="img/help.png" title="'+err+'"> ';
				btn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','color:red','Delete data of job '+shortid,'removebtn');
				if(~this.parameters().indexOf('-updated')) model.treealtered(true); //realignment failed: revert tree status
			}
		}
		else{ btn = btnhtml('dialog(\'terminate\',{id:\''+this.id()+'\',btn:this})','Kill','color:red','Terminate job '+shortid,'removebtn'); }
		var now = new Date().getTime();
		var jobtype = this.type? this.type() : 'Prank alignment';
		var lastdate = msectodate(this.lasttime());
		var logline = this.log()? this.log() : 'Process finished '+lastdate;
		return  '<span class="note">Name:</span> <span class="logline">'+this.name()+'<span class="fade"></span></span><br><span class="note">Status:</span> '+status+'<br><span class="note">Job type:</span> '+jobtype+btn+'<br><span class="note">Started:</span> '+msectodate(this.starttime())+'<br><span class="note">Job ID:</span> <span title="Folder path: '+this.id()+'">'+shortid+'</span><br><span class="note">Feedback:</span> <span class="logline actiontxt" onclick="showfile(this,\''+this.logfile()+'\')" title="Last update '+lastdate+'. Click for full log.">'+logline+'<span class="fade"></span></span>';
    }, this).extend({throttle: 100});
}

//HTML rendering for imported jobs (library window)
var analysmodel = function(data){
	ko.mapping.fromJS(data, {}, this);
	var btnhtml = function(action,name,style,title,sclass){ return '<a class="button itembtn '+(sclass||'')+'" style="'+(style||'')+'" title="'+(title||'')+'" onclick="'+action+';return false;">'+name+'</a>'; };
	this.divh = '55px';
	this.isactive = false;
    this.html = ko.computed(function(){
    	var imported = this.imported? msectodate(this.imported()) : 'Never';
    	var saved = this.savetime? msectodate(this.savetime()) : 'Never';
    	if(this.outfile && this.outfile()){
    		if (typeof(model)!='undefined' && this.id() == model.currentid()){ 
    			var btnname = 'Restore';
    			var btntitle = 'Revert back to saved state';
    			this.isactive = true;
    		}else{
    			var btnname = 'Open';
    			var btntitle = 'Open '+this.outfile();
    			this.isactive = false;
    		}
    		var itembtn = btnhtml('getfile(\''+this.outfile()+'\',this,\''+this.id()+'\')',btnname,'',btntitle);
    		var removebtn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','','Delete folder '+this.id(),'removebtn');
    	}
    	else{ //no output files specified in metadata
    		var thisid = this.id();
    		var activejob = ko.utils.arrayFirst(serverdata.jobdata(),function(job){ return job.id()==thisid });
    		if(activejob){
    			var itembtn = btnhtml('dialog(\'jobstatus\')','Status','View running background processes');
    			var removebtn = '';
    			imported += ' (running job)'
    		} else {
    			var itembtn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','color:red','Delete folder '+this.id());
    			var removebtn = '';
    			imported += ' (broken)';
    		}
    	}
    	
    	if(this.hasOwnProperty('aligner') && this.aligner()){ //item started as alignment job
    		var alignerdata = this.aligner().split(':');
    		var source = '<span class="note">Aligner:</span> <span style="cursor:default" title="Executable: '+alignerdata[1]+'">'+alignerdata[0]+'</span><br><span class="note">Parameters:</span> <span class="logline" style="cursor:text" title="'+this.parameters()+'">'+this.parameters()+'<span class="fade"></span></span>';
    	}
    	else{ //item was imported
    		var sourcedata = this.hasOwnProperty('source')&&this.source()? 'from '+this.source() : 'files';
    		var source = '<span class="note">Data source:</span> Imported '+sourcedata;
    	}
    	
    	if(this.hasOwnProperty('children')&&this.children()>0){
    		var actclass = model.currentid()!=this.id() && ~model.currentid().indexOf(this.id())? ' activeitem' : ''; //child open > color btn white
    		var childbtn = btnhtml('communicate(\'getmeta\',{parentid:\''+this.id()+'\'},\'analysdata\')','<span class="svg">'+svgicon('children')+'</span> '+this.children(),'','View subanalyses','childbtn'+actclass);
    	} else var childbtn = '';
    	
    	var idend = this.id().lastIndexOf('/');
		var folderid = idend!=-1? this.id().substring(idend+1) : this.id();
		return '<div><span class="note">Name:</span> <input type="text" class="hidden" onblur="communicate(\'writemeta\',{id:\''+this.id()+
		'\',key:\'name\',value:this.value})" value="'+this.name()+'" title="Click to edit"><br><span class="note">Last opened:</span> '+
		imported+'<br><span class="note">File directory:</span> <span class="rotateable">&#x25BA;</span><span class="actiontxt" title="Browse folder" onclick="showfile(this,\''+
		this.id()+'\')">'+folderid+'</span><br>'+itembtn+'<span class="note">Started:</span> '+msectodate(this.starttime())+'<br><span class="note">Last saved:</span> '+
		saved+'<br>'+source+childbtn+removebtn+'<span class="actiontxt itemexpand" onmousedown="toggleitem(this,\''+this.divh+'\')" title="Toggle additional info">&#x25BC; More info</span></div>';
    }, this).extend({throttle: 100});
}

function toggleitem(btn,starth){ //expand/contract job divs (library window)
	var itemdiv = $(btn).closest('div.itemdiv');
	if(btn.innerHTML == '\u25BC More info'){ //expand itemdiv
		itemdiv.css('height',itemdiv.children().first().height()+12+'px');
		setTimeout(function(){btn.innerHTML = '\u25B2 Less info';},400);
	}
	else{ //contract
		itemdiv.css('height',starth);
		setTimeout(function(){btn.innerHTML = '\u25BC More info';},400);
	}
	return false; //onclick
}

function showfile(btn,file){ //show logfile/folder content from server (status/library window)
	var logdiv = $(btn).closest('div.itemdiv').next('div.logdiv');
	var rotatearr = $(btn).prev('span.rotateable');
	if(!logdiv.length){ //logdiv not yet created
		logdiv = $('<div class="insidediv logdiv">');
		$(btn).closest('div.itemdiv').after(logdiv);
	}
	else if(logdiv.css('display')!='none'){
		if(rotatearr.length) rotatearr.removeClass('rotateddown');
		logdiv.slideUp(200);
		return false;
	}
	if(rotatearr.length) rotatearr.addClass('rotateddown');
	if(~file.indexOf('.')){ //logfile
		$.ajax({
			type: "GET",
			url: file,
    		dataType: "text",
    		success: function(data){
    			logdiv.html('<pre>'+data+'</pre>');
    			logdiv.slideDown();
    		},
    		error: function(){ logdiv.html('Failed to load the log file.'); logdiv.slideDown(); }
    	});
    }
    else{ //folder
    	communicate('getdir',{dir:'analyses/'+file},{success: function(data){
    		filearr = data.split('|');
    		var str = '', outfile = ''; //mark resultfile in filelist
    		$.each(serverdata['analysdata'](),function(i,meta){ if(file==meta.id()&&meta.outfile) outfile = meta.outfile(); });
    		$.each(filearr,function(i,f){
    			fdata = f.split(':');
    			str += '<div class="row">';
    			if(~outfile.indexOf(fdata[0])) str += '<span title="Main data file" style="color:darkred;cursor:default">'+
    			fdata[0]+'</span>';
    			else str += fdata[0];
    			str += '<span class="note">'+numbertosize(fdata[1],'byte')+'</span> ';
    			if(!isNaN(fdata[1])) str += '<a class="button" onclick="dialog(\'export\',{exporturl:\''+
    			'analyses/'+file+'/'+fdata[0]+'\'});return false;" title="View file content">View</a>';
    			str += '</div>';
    		});
    		logdiv.html(str);
    		logdiv.slideDown(); 
    	}});
    }
    return false; //onclick
}

function titlemenu(e,input){ //page title pop-up menu
	var $input = $(input);
	if($input.hasClass('editable')) return false;
	e.preventDefault();
	e.stopPropagation();
	var title = '';
	var menudata = {'Rename':function(){$input.addClass('editable'); $input.focus();}, 
		'Save':function(){savefile()}, 'Export':function(){dialog('export')}};
	if(model.currentid()) menudata['View in Library'] = function(){dialog('library')};
	else title = 'Not in Library';
	tooltip('',title,{target:input, arrow:'top', shifty:-5, data:menudata, style:'white greytitle'});
}

function toggletop(collapse){
	if(typeof(collapse)=='undefined') collapse = !$('body').hasClass('mintop');
	else if(collapse==$('body').hasClass('mintop')) return;
	var arrdiv = $('#topcollapse');
	if(collapse){
		$('body').addClass('mintop'); localStorage.collapse = "collapse";
		setTimeout(function(){arrdiv.html('<span>&#x25BC;</span>');
		$('#top .toptext, #top .title, #bottom').css('display','none'); $(window).trigger('resize'); },600);
	} else {
		$('#top .toptext, #bottom').css('display',''); localStorage.collapse = "";
		if(!model.offline()) $('#top .title').css('display','');
		setTimeout(function(){$('body').removeClass('mintop')},100);
		setTimeout(function(){arrdiv.html('<span>&#x25B2;</span>'); $(window).trigger('resize'); },600);
	}
	
}


function communicate(action,senddata,options){ //send and receive(+save) data from local server fn(str,obj,[str|obj])
	if(!action || model.offline()) return false;
	if(!options) options = {};
	var formdata = options.form? new FormData(options.form) : new FormData();
	formdata.append('action',action);
	if(action=='getmeta'){
		if(typeof(senddata.parentid)=='undefined' && model.parentid()) senddata = {parentid:model.parentid()};
	}
	if(senddata) $.each(senddata,function(key,val){
		if(typeof(val)=='object') val = JSON.stringify(val);
		formdata.append(key,val);
	});
	var btntxt = options.btntxt || ((typeof(options)=='object' && options.btn)? options.btn.innerHTML : '');
	var retryfunc = function(){ communicate(action,senddata,options) }; //resend request
	var restorefunc = function(){ //restore original button function
    	if(btntxt.indexOf('spinner')==-1) options.btn.innerHTML = btntxt;
    	options.btn.title = '';
    	$(options.btn).off('click').click(retryfunc);
    }
    var endfunc = ''; //follow-up data refresh
    if(action=='writemeta'||action=='save'||action=='startalign'){
      var endfunc = function(){
    	if (action!='save') communicate('alignstatus','','jobdata'); else model.unsaved(false);
    	if (action!='startalign') communicate('getmeta',{parentid:parentid(senddata.id)},'analysdata');
      };
    }
    if(action=='alignstatus' && typeof(options)=='string') options = {saveto:options,retry:true}; //retry in case of error
    		
	return $.ajax({
		type: "POST",
		url: 'index.html',
		beforeSend : function(xhrobj){
			if(options.btn){ //make process abortable with action button or window closebutton
				options.btn.innerHTML = '<img src="img/spinner.gif" class="icn"/>';
				options.btn.title = 'Click to abort';
				$(options.btn).off('click').click(function(){ xhrobj.abort() });
				$(options.btn).closest("div.popupwindow").find("img.closebtn").click(function(){ xhrobj.abort() });
			}
		},
    	success: function(data){
    		var successfunc = '';
    		if(action=='save'){
				successfunc = function(data){
    				try{
    					data = JSON.parse(data); model.currentid(data.id);
    					if(settingsmodel.keepid){
    						localStorage.currentid = JSON.stringify(data.id);
    						localStorage.currentfile = JSON.stringify("analyses/"+data.id+"/saved.xml");
    					}
    				}catch(e){ console.log('JSON error in savefile response'); };
    				if(options.btn) options.btn.innerHTML = 'Saved';
    			}
    		}
    		else if(action=='getmeta'){
    			successfunc = function(){
    				if(senddata.parentid){
    					var dirtrail = senddata.parentid.replace(/\/children\//g,' &#x25B8; ');
       					model.libdir('Main &#x25B8; '+dirtrail+' <br><a class="button small square" '+
       					'title="Go to parent directory" onclick="communicate(\'getmeta\',{parentid:\''+
       					parentid(senddata.parentid)+'\'},\'analysdata\'); return false;">&#x25C1; Parent </a>');
    				}
    				else model.libdir('Main directory');
    			}
    		}
    		else if(action=='checkstatus'){
    			successfunc = function(data){
    				if(data=="OK") model.offline(false); else model.offline(true);
    			}
    		}
    			
    		if(typeof(options)=='object'){
    			if(typeof options.success=='function') successfunc = options.success;
    			if(typeof options.func=='function') endfunc = options.func;
    			if(options.btn && !successfunc){
    				try{ data = JSON.parse(data); } catch(e){ data = data.replace(/^'|'$/g, "") } //catch json parse error
    				if(typeof(data)=='string') options.btn.innerHTML = data;
    				else if(data.file) options.btn.href = data.file;
    				if($(options.btn).css('opacity')==0) $(options.btn).css('opacity',1);
    			}
    			if(options.saveto) options = options.saveto;
    		}
    		
    		if(typeof(options)=='string'){ //save response data to 'serverdata' array
    			if(typeof(serverdata[options])=='undefined'){ //create new serverdata slot
    				serverdata[options] = ko.mapping.fromJS(data,{key:function(item){ return ko.utils.unwrapObservable(item.id); }});
    			}
    			else{ ko.mapping.fromJSON(data,{},serverdata[options]);  } //refresh current serverdata slot
    		}
    		else if(typeof(options)=='function'){ //save response data to ko.observable
    			options(data);
    		}
    		
    		if(successfunc) successfunc(data); //custom successfunc (data processing/import)
    		if(options.restore) restorefunc(); //restore original button state (reusable button)
    		if(endfunc) setTimeout(function(data){ endfunc(data); }, 500); //follow-up (data refresh)
    	},
    	error: function(xhrobj,status,msg){
    		if(typeof(options)=='object'){
    			if(!msg&&status!="abort"){ //no response
        			if(options.retry){ //allow 2 retries
        				options.retry = options.retry=='take2'? false : 'take2';
        				if(btntxt) options.btntxt = btntxt;
        				setTimeout(retryfunc, 2000); return;
        			}
        			msg = 'No response from server. Try again.';
        		}
    			if(options.btn){
    				if(status=="abort"){ restorefunc(); }
    				else{
    					options.btn.innerHTML = 'Failed <span class="svgicon" style="margin-right:-10px" title="'+msg+'">'+svgicon('info')+'</span>';
    					setTimeout(restorefunc, 3000);
    					if(endfunc) setTimeout(function(data){ endfunc(data); }, 500); //data refresh
    				}
    			}
    		}
    		else if(typeof(options)=='string' && endfunc){
    			setTimeout(endfunc, 500); //error in serverdata sync. Refresh data.
    		}
    	},
    	data: formdata,
    	dataType: "text",
        cache: false,
        contentType: false,
        processData: false
    });
}


function togglemenu(id,action){ //show/hide dropdown menus
	var menudiv = $('#'+id);
	if(!action) action = menudiv.parent().hasClass('visible')? 'hide' : 'show';
	if(action=='show' && $('li',menudiv).length){
		//menudiv.parent().css('display','block');
		menudiv.parent().addClass('visible');
		menudiv.css('margin-top',-1);
	}
	else{
		$.each($('div.buttonmenu'),function(){
			var self = $(this);
			self.parent().removeClass('visible');
			self.css('margin-top',0-self.height()-6);
			//setTimeout(function(){ self.parent().css('display','none'); },700);
		});
	}
}

function numbertosize(number,type,min){
	if(isNaN(number)) return number;
	if(!type) type = '';
	else if(type=='dna'||type=='rna') type = 'bp';
	else if(type=='protein') type = 'residues';
    var sizes = type=='bp' ? [' bp',' kb',' Mb',' Gb'] : type=='byte' ? [' Bytes', ' KB', ' MB', ' GB'] : type=='sec'? [' sec',' min :',' h :'] : ['', '&#x2217;10<sup>3</sup>', '&#x2217;10<sup>6</sup>', '&#x2217;10<sup>9</sup>'];
    var order = type=='bp' ? 1024 : 1000;
    if(!min){ var min = type=='bp'||type=='byte'||type=='sec'? order : 1000000; }
    number = parseInt(number);
    if (number < min) return number+(sizes[0]||' '+type);
    var i = 0;
    if(type=='sec'){
    	var str = '';
    	while(number>=order && i<sizes.length-1){ str = (number%order)+sizes[i]+' '+str; number = number/order; i++; }  
    	return str; //"3 h : 12 min : 36 sec"
    }
    else{
    	while(number>=order && i<sizes.length-1){ number = number/order; i++; }  
    	return number.toFixed(1).replace('.0','')+(sizes[i]||' '+type); //"2 KB"; "1.3 Mb";
    }
};

function msectodate(sec){
	var t = new Date(parseInt(sec)*1000);
	return ('0'+t.getDate()).slice(-2)+'.'+('0'+(t.getMonth()+1)).slice(-2)+'.'+t.getFullYear().toString().substr(2)+' at '+t.getHours()+':'+('0'+t.getMinutes()).slice(-2);
}

/* Input file parsing */
function parseimport(options){ //options{dialog:jQ,update:true,mode}
	if(!options) options = {};
	if(!options.mode) options.mode = '';
	var errors = [], notes = [], treeoverwrite = false, seqoverwrite = false;
	var Tidnames = {}, Tsequences = '', Ttreedata = '', Ttreesource = '', Tseqsource = '', Tseqformat = '';
	var metaidnames = {}, nodeinfo = {}, visiblecols = [];
	var ensinfo = options.ensinfo || {};
	if(options.id){ //item imported from library. Get metadata.
		var importdata = ko.mapping.toJS(serverdata.importdata);
		if(importdata.id && importdata.id==options.id){
			metaidnames = importdata.idnames || {};
			nodeinfo = importdata.nodeinfo || {};
			ensinfo = importdata.ensinfo || {};
			visiblecols = importdata.visiblecols || [];
		}
		$.each(ko.mapping.toJS(serverdata.analysdata),function(d,jobdata){
			if(jobdata.id==options.id && jobdata.source) options.source = jobdata.source;	
		});
	}
	
	var parseseq = function(seqtxt,filename,format,nspecies,nchars){
		if(Tsequences) seqoverwrite = true;
		Tsequences = {};
   		Tseqsource = filename;
   		
   		var iupac = 'ARNDCQEGHILKMFPSTUWYVBZX\\-?*';
   		var seqstart = new RegExp('\\s(['+iupac+']{10}\\s?['+iupac+']{10}.*)$','img');
   		if(format=='clustal'){ //remove clustal-specific additions
   			seqtxt = seqtxt.replace(/ {1}\d+$/mg,'');
   			seqtxt = seqtxt.replace(/^[ \:\.\*]+$/mg,'');
   		}
   		else if(format=='nexus'){ seqtxt = seqtxt.replace(/\[.+\]/g,''); } //remove "[]"
   		else if(format=='phylip' && nspecies){ //detect & reformat strict phylip
   			var strictphy = false;
   			var capture = seqstart.exec(seqtxt);
   			if(capture){
   				var linelength = capture[1].length;
   				for(var s=1;s<nspecies;s++){
   					capture = seqstart.exec(seqtxt);
   					if(linelength != capture[1].length){ strictphy = true; break; }
   					linelength = capture[1].length;
   				}
   				seqstart.lastIndex = 0;
   			} else { strictphy = true; }
   			if(strictphy){ seqtxt = seqtxt.replace(/^ *.{10}/gm,"$& "); }
   		}
   		seqtxt = seqtxt.replace(/ *[\n\r]\s*/g,'\n'); //collapse multilines+whitespace
   		seqtxt = seqtxt.replace(/ {2,}/g,' ');
   		var taxanames = [], bookmark = 0, interleaved = false, firstseqline = true, name = '';
   		var repeatingnames = format=='phylip'? false : true;
   		while(capture = seqstart.exec(seqtxt)){ //get names & first sequences
   			var seqarr = capture[1].replace(/ /g,'').split('');
   			if(bookmark < capture.index){ //found name btwn sequences
   				name = seqtxt.substring(bookmark+1,capture.index);
   				if(Tsequences[name]){ interleaved = true; repeatingnames=name; break; }
   				Tsequences[name] = seqarr; taxanames.push(name);
   			}
   			else{ //found sequential sequence line
   				if(firstseqline){ if(taxanames.length>1){ interleaved = true; repeatingnames=false; break; } firstseqline = false; }
   				Tsequences[name].push.apply(Tsequences[name],seqarr);
   			}
   			bookmark = seqstart.lastIndex;
   		}
   		if(interleaved){ //continue parsing for interleaved seq.
   			var fulline = /^.+$/gm;
   			fulline.lastIndex = bookmark;
   			var nameind = 0, name = '';
   			while(capture = fulline.exec(seqtxt)){
   				var name = taxanames[nameind];
   				if(repeatingnames){
   					if(capture[0].indexOf(name)!=0){ errors.push("Non-unique taxa name found!<br>("+repeatingnames+")"); break; }
   					seqarr = capture[0].substr(name.length).replace(/ /g,'').split('');
   				}
   				else seqarr = capture[0].replace(/ /g,'').split('');
   				Tsequences[name].push.apply(Tsequences[name],seqarr);
   				nameind++; if(nameind==taxanames.length) nameind = 0;
   			}
   		}
   		if(nspecies && errors.length==0 && taxanames.length!=nspecies) notes.push("Number of taxa found doesn't match <br>the file metainfo ("+nspecies+", "+taxanames.length+" found)");
   		if(nchars && errors.length==0 && Tsequences[taxanames[0]].length!=nchars) notes.push("The sequence length doesn't match <br>the file metainfo ("+nchars+" chars, "+Tsequences[taxanames[0]].length+" found)");			
	};
	
	var parsenodeseq = function(){
		var self = $(this);
   		var id = self.attr("id");
   		var name = self.attr("name") || id;
   		if(metaidnames[name]) name = metaidnames[name];
   		name = name.replace(/_/g,' ')
   		if(~name.indexOf('#')) name = 'Node '+name.replace(/#/g,'');
   		if(id!=name) Tidnames[id] = name;
   		var tmpseq = self.find("sequence").text();
   		if(tmpseq.length != 0){
   			tmpseq = tmpseq.replace(/\s+/g,'');
   			if(Tsequences[name]){ errors.push("Non-unique taxa name found!<br>("+name+")"); }
   			Tsequences[name] = tmpseq.split('');
   		}
   	};
	
	var parsetree = function(treetxt,filename,format){ //import tree data
		if(Ttreedata) treeoverwrite = true;
		Ttreedata = {};
		Ttreesource = filename;
		if(!format) format = 'newick';
		if(format=='newick'){ //remove whitespace
			if(Tseqformat=='fasta'){ //match fasta name truncating
				//treetxt = treetxt.replace(/(['"]\w+)[^'"]+(['"])/g,"$1$2");
			}
			treetxt = treetxt.replace(/\n+/g,'');
		}
		Ttreedata[format] = treetxt;
		if(format=='phyloxml' && ~treetxt.indexOf('<mol_seq')){ //sequences in tree data
			if(Tsequences) seqoverwrite = true;
			Tsequences = 'phyloxml';
   			Tseqsource = filename;
		}
	};
	
	var filenames = options.filenames || Object.keys(filescontent);
	filenames.sort(function(a,b){ //sort filelist: [nexus,xml,phylip,...,tre]
		if(/\.tre/.test(a)) return 1; else if(/\.tre/.test(b)) return -1;
		return /\.ne?x/.test(a)? -1: /\.xml/.test(a)? /\.ne?x/.test(b)? 1:-1 : /\.ph/.test(a)? /\.ne?x|\.xml/.test(b)? 1:-1 : /\.ne?x|\.xml|\.ph/.test(b)? 1: 0;
	});
	
	var datatype = '';
	$.each(filenames,function(i,filename){
		var file = filescontent[filename];
		if(typeof(file)=='object' && file.hasOwnProperty('data')){ //Ensembl JSON object
			if(!file.data[0].homologies) return;
			var gotsource = false; Tsequences = {};
			$.each(file.data[0].homologies,function(j,data){
				if(!gotsource){
					var species = data.source.species.replace('_',' ');
					Tsequences[data.source.id] = data.source["align_seq"].split('');
					ensinfo.species = species;
					nodeinfo[data.source.id] = {genetype:'source gene', cladename:data.source.id, species:species, accession:data.source.protein_id};
					gotsource = true;
				}
				var species = data.target.species.replace('_',' ');
				Tsequences[data.target.id] = data.target["align_seq"].split('');
				nodeinfo[data.target.id] = {genetype:data.type.replace(/_/g,' ').replace('2',' to '), cladename:data.target.id, species:species, 
				accession:data.target.protein_id, srate:data.target.dn_ds, taxaname:data.subtype, identity:data.target.perc_id};
			});
		}
		else if(typeof(file)!='string'){ errors.push("Couldn't identify fileformat for "+filename); return true; }
		else if(/^<.+>$/m.test(file)){ //xml
			if(~file.indexOf("<phyloxml")){ //phyloxml tree
				if(options.mode=='check'){ datatype += 'tree '; return true; }
				parsetree(file,filename,'phyloxml');
			}
			else{  //HSAML
			  var newickdata = $(file).find("newick");
			  if(newickdata.length != 0){
			  	if(options.mode=='check') datatype += 'tree ';
			  	else parsetree(newickdata.text(),filename);
			  }
			  var leafdata = $(file).find("leaf");
			  if(leafdata.length != 0){
			  	if(options.mode=='check') datatype += 'seq ';
			  	else { if(Tsequences) seqoverwrite = true; Tsequences = {}; Tseqsource = filename; }
			  }
			  if(options.mode=='check') return true;
   			  leafdata.each(parsenodeseq);
   			  var nodedata = $(file).find("node");
   			  nodedata.each(parsenodeseq);
   			}
   			//if(newickdata.length!=0 && leafdata.length!=0){ return false }//got data, no more files needed
   		}
   		else if(/^>\s?\w+/m.test(file)){ //fasta
   			if(options.mode=='check'){ datatype += 'seq '; return true; }
   			if(Tsequences) seqoverwrite = true;
   			else Tsequences = {};
   			Tseqsource += ' '+filename; Tseqformat = 'fasta';
   			var nameexp = /^> ?(\w+).*$/mg;
   			var result = [];
   			while(result = nameexp.exec(file)){ //find nametags from fasta
   				var to = file.indexOf(">",nameexp.lastIndex);
   				if(to==-1){ to = file.length; }
   				var tmpseq = file.substring(nameexp.lastIndex,to); //get text between fasta tags
   				tmpseq = tmpseq.replace(/\s+/g,''); //remove whitespace
   				var name = result[1];
   				if(Tsequences[name]){ errors.push("Non-unique taxa name found!<br>("+name+")"); return false; }
   				Tsequences[name] = tmpseq.split('');
   			}
   		}
   		else if(/^clustal/i.test(file)){ //Clustal
   			if(options.mode=='check'){ datatype += 'seq '; return true; }
   			file = file.substring(file.search(/[\n\r]+/)); //remove first line
   			parseseq(file,filename,'clustal');
   		}
   		else if(narr = file.match(/^\s*(\d+) {1}(\d+) *[\n\r]/)){ //phylip alignment
   			if(options.mode=='check'){ datatype += 'seq '; return true; }
   			file = file.substring(file.search(/[\n\r]/)); //remove first line
   			parseseq(file,filename,'phylip',narr[1],narr[2]);
   		}
   		else if(~file.indexOf("#NEXUS")){ //NEXUS
   			var blockexp = /begin (\w+);/igm;
   			var result = '', hastree=false, hasseq=false;
   			while(result = blockexp.exec(file)){ //parse data blocks
   				var blockname = result[1].toLowerCase();
   				if(blockname=='trees'||blockname=='data'||blockname=='characters'){
   					if(blockname=='trees'){
   						if(options.mode=='check'){ datatype += 'tree '; continue; }
   						var blockstart = file.indexOf('(',blockexp.lastIndex);
   						var blockend = file.indexOf(';',blockstart);
   						var blocktxt = file.substring(blockstart,blockend);
   						parsetree(blocktxt,filename);
   						hastree = true;
   					}
   					else if(blockname=='data'||blockname=='characters'){
   						if(options.mode=='check'){ datatype += 'seq '; continue; }
   						if(marr=file.match(/ntax=(\d+)/i)) var ntax = marr[1]; else var ntax = '';
   						if(marr=file.match(/nchar=(\d+)/i)) var nchar = marr[1]; else var nchar = '';
   						var blockstart = file.indexOf(file.match(/matrix/i)[0],blockexp.lastIndex);
   						var blockend = file.indexOf(';',blockstart);
   						var blocktxt = file.substring(blockstart+6,blockend);
   						parseseq(blocktxt,filename,'nexus',ntax,nchar);
   						hasseq = true;
   					}
   				}
   			}
   			if(hastree && hasseq) return false; //got tree+seq: break
   		}
   		else if(/^\s?\(+\s?(\w+|['"][^'"]+['"])(:\d+\.?\d*)?,\s?['"\w]+/.test(file)){ //newick tree
   			if(options.mode=='check'){ datatype += 'tree '; return true; }
   			parsetree(file,filename);
   		}
   		else{
   			errors.push("Couldn't identify fileformat for "+filename);
   		}
	});//for each file
	if(options.mode=='check') return datatype;
	filescontent = {};
	
	if(options.mode=='cdna'){
		if(!Tseqsource) errors.push('No sequence data found!');
		else if(~Tsequences[Object.keys(Tsequences)[0]].join('').search(/[^ATGCNUX.:?!_-]/ig)){
			errors.push('Given data is not a DNA sequence!');
		}
	}
	
	if(errors.length){ //diplay errors. no import
		var ul = $('<ul>').css({'color':'red','white-space':'normal'});
		$.each(errors,function(j,err){ ul.append('<li>'+err+'</li>') });
		if(options.dialog) $('.errors',options.dialog).empty().append('<br><b>File import errors:</b><br>',ul,'<br>');
		else dialog('error',['File import failed:','<br>',ul,'<br>']);
		return false;
	} else { //no errors: use parsed data
		if(treeoverwrite) notes.push('Tree data found in multiple files. Using '+Ttreesource);
		if(seqoverwrite) notes.push('Sequence data found in multiple files. Using '+Tseqsource);
		
		var feedback = function(){
   	  		if(options.dialog){
				$('.errors',options.dialog).text('Import complete.');
				setTimeout(function(){ $('.closebtn',options.dialog).click() }, 3000);
			}
			else if(options.importbtn){
				options.importbtn.text('Imported');
				setTimeout(function(){ $(options.importbtn.closest('.popupwindow').find('.closebtn')).click() }, 1000);
			}
   	  		if(notes.length){
				var ul = $('<ul>').css('white-space','normal');
				$.each(notes,function(j,note){ ul.append($('<li>').append(note)); });
				setTimeout(function(){ makewindow('File import warnings',['<br>',ul,'<br>'],{btn:'OK',icn:'info.png'}); }, 3000); 
			}
		};
		
		var namearr = [];
		if(typeof(Tsequences)=='object'){ //seq. data drop in
			$.each(Tsequences,function(name,seq){ if(~name.indexOf('_')){ //make spaces in names
				Tsequences[name.replace(/_/g,' ')] = seq;
				delete Tsequences[name]; 
			}});
			if(options.mode=='cdna'){ model.dnasource(Tsequences); feedback(); return true; }
			sequences = Tsequences; Tsequences = '';
			namearr = Object.keys(sequences);
		}
		
		dom.wrap.css('left',0); dom.seq.css('margin-top',0); dom.treewrap.css('top',0); //reset scroll
		
		if(!Ttreedata && namearr.length){ //no tree: fill placeholders (otherwise done by jsPhyloSVG)
			model.visiblerows.removeAll(); leafnodes = {};
			var nodecount = 0, leafcount = namearr.length; Ttreesource = false;
			$.each(namearr,function(indx,arrname){
				leafnodes[arrname] = {name:arrname};
				if(nodeinfo[arrname]) leafnodes[arrname].ensinfo = nodeinfo[arrname];
				model.visiblerows.push(arrname); 
			});
		} else if(Ttreedata){ //get leaf count estimate
			var nodecount = Ttreedata.phyloxml? $(Ttreedata.phyloxml).find("clade").length : Ttreedata.newick.match(/\(/g).length;
			var leafcount = Ttreedata.phyloxml? $(Ttreedata.phyloxml).find("name").length : Ttreedata.newick.match(/,/g).length+1;
		}
		
		if(Ttreedata){ //tree data drop in
	  		model.treesource(Ttreesource); model.leafcount(leafcount); //leafcount > tree canvas height
	  		if(!$.isEmptyObject(nodeinfo)) Ttreedata.nodeinfo = nodeinfo;
	  		if(Tsequences=='phyloxml'){ idnames= {}; sequences = {}; } //sequence data will come from phyloxml
	  		else idnames = Tidnames;
	  		if(!$.isEmptyObject(treesvg)){ //replace current tree
	  			if(Tseqsource) Ttreedata.treeonly = true; //skip sequence drawing step (done after seq. processing)
	  			treesvg.loaddata(Ttreedata); //loads treedata (and redraws sequences)
	  			if(!Tseqsource) model.addundo({name:'Replace tree',type:'tree',data:treesvg.data.root.removeAnc().write('tags'),info:'New tree was imported.'});
	  			model.treealtered(true);
	  		}
	  		else if(Tsequences=='phyloxml') redraw(Ttreedata); //Make tree canvas. Get sequence data from phyloxml
	  	} else { //only seq. data given => empty tree canvas
	  		treesvg = {}; model.treesource(''); model.treealtered(false);
	  	}
		
		var newcolors = false;
	  	if(Tseqsource){ //process new sequence data
	  		if(Tsequences=='phyloxml') namearr = Object.keys(sequences);
			var maxseqlen = 0, minseqlen = sequences[namearr[0]].length, totallen = 0;
			var longestseq = '', hasdot = false, alignlen = 0, tmpseq, seqlen;
			for(var n=0;n<namearr.length;n++){ //count sequence lengths
				tmpseq = sequences[namearr[n]].join('');
				if(!hasdot && ~tmpseq.indexOf('.')) hasdot = true;
				if(tmpseq.length > alignlen) alignlen = tmpseq.length;
				tmpseq = tmpseq.replace(/[-_.:]/g,''); seqlen = tmpseq.length; totallen += seqlen;
   				if(seqlen > maxseqlen){ maxseqlen = seqlen; longestseq = tmpseq; }
	   			if(seqlen < minseqlen){ minseqlen = seqlen; }
			}
			var dnachars = new RegExp('['+alphabet.dna.slice(0,-2).join('')+'?!'+']','ig');
			longestseq = longestseq.replace(dnachars,''); //check if a sequence consists of DNA symbols
			var oldtype = model.seqtype();
			var newtype = !longestseq.length? 'dna' : !longestseq.replace(/u/ig,'').length? 'rna' : 'protein';
			if(newtype=='dna'||newtype=='rna') model.dnasource(sequences);
			else if(!options.id || options.id.indexOf(model.currentid())==-1) model.dnasource({});
			model.seqtype(newtype); model.hasdot(hasdot); model.currentid('');
			if(newtype!=oldtype){ newcolors = true; makeColors(); }
			
			model.totalseqlen(totallen); model.alignlen(alignlen); model.seqcount(namearr.length);
			model.minseqlen(minseqlen); model.maxseqlen(maxseqlen); idnames = Tidnames;
			model.seqsource(Tseqsource); maskedcols = [];
			if(visiblecols.length) model.visiblecols(visiblecols);
			else{
				model.visiblecols.removeAll();
				for(var c=0;c<model.alignlen();c++){ model.visiblecols.push(c) } //mark all columns visible
			} 
			model.undostack.remove(function(item){ return item.type=='seq' }); //remove prev. seq. from undostack
	  	}
	  	model.ensinfo(ensinfo);
	  	model.refreshundo();
	  	
   	  	if($.isEmptyObject(treesvg)||newcolors||Ttreedata.treeonly){ //render new data
   	  		if(Ttreedata.treeonly) Ttreedata.treeonly = false;
   	  		redraw(Ttreedata||'');
   	  		if(!model.treesnapshot && treesvg.data) model.treesnapshot = treesvg.data.root.removeAnc().write('tags');
   	  	}
   	  	
   	  	if(!$.isEmptyObject(treesvg) && !$.isEmptyObject(sequences)){ //check tree<=>seq data match
   	  		var emptyleaves = [];
   	  		$.each(leafnodes,function(name,node){
   	  			if(!sequences[name]){ emptyleaves.push(name); node.active = true; }
   	  			else node.active = false;
   	  		});
   	  		if(emptyleaves.length){
   	  			var leafsnote = emptyleaves.length+' out of '+Object.keys(leafnodes).length+' tree leafs do not match sequence data';
   	  			leafsnote += emptyleaves.length<5? ':<br>'+emptyleaves.join(', ') : '.';
   	  			var clearbtn = $('<a class="button square small">Clear sequences</a>');
   	  			clearbtn.click(function(){
   	  				model.undostack.remove(function(item){ return item.type=='seq' });
   	  				model.currentid(''); sequences = {}; redraw(); 
   	  				$(this).closest('.popupwindow').find('.closebtn').click();
   	  			});
   	  			var prunebtn = $('<a class="button square small">Prune empty leafs</a>');
   	  			prunebtn.click(function(){
   	  				toolsmodel.processLeafs('remove',emptyleaves.length); 
   	  				$(this).closest('.popupwindow').find('.closebtn').click();
   	  			});
   	  			leafsnote = $('<span>'+leafsnote+'<br><br></span>').append(clearbtn);
   	  			if(Object.keys(leafnodes).length-emptyleaves.length>3) leafsnote.append(prunebtn);
   	  			notes.push(leafsnote);
   	  		}
   	  	}
   	  	
   	  	if(options.source){
   	  		var src = options.source;
   	  		var sourcetype = src=='localread'||src=='upload'? 'local computer' : ~src.indexOf('import')? 'analysis library' : src=='download'? 'internet' : options.source;
   	  		model.sourcetype(sourcetype);
   	  	}
   	  	
   	  	if(options.id){ //save import date in server
			model.currentid(options.id); model.unsaved(false);
        	communicate('writemeta',{id:options.id,key:'imported'});
        }
   	  	serverdata.importdata = ko.mapping.fromJS({});
   	  	
   	  	feedback();
   	  	return true;
   	  }
}

/* Output file parsing */
function parseexport(filetype,options){
	var usemodel = false;
	if(!filetype && !options){ //'Make file' clicked: use datamodel
		usemodel = true;
		exportmodel.fileurl('');
		filetype = exportmodel.format().name;
		options = {};
		options.masksymbol = exportmodel.masksymbol()=='lowercase'? false : exportmodel.masksymbol();
		options.includetree = exportmodel.incltree();
		options.tags = exportmodel.variant().name&&(exportmodel.variant().name=='extended newick');
		options.includeanc = exportmodel.inclancestral();
		options.removehidden = !exportmodel.inclhidden();
	} else if(!options) var options = {};
	var nameids = options.nameids||{};
	var output = '', ids = [], regexstr = '', dict = {}, seqtype = model.seqtype();
	
	if(options.masksymbol){ $.each(alphabet[seqtype],function(i,symbol){ //translation for masked positions
		if(seqtype=='codons') symbol = i;
		if(symbols[symbol].masked) dict[symbols[symbol].masked] = options.masksymbol;
	});}
	dict['!'] = '?'; dict['='] = '*';
	if(!options.gapsymbol) options.gapsymbol = '-';
	$.each(['-','_','.',':'],function(i,symbol){ dict[symbol] = options.gapsymbol; });
	$.each(dict,function(symbol){ regexstr += symbol; });
	var regex = regexstr ? new RegExp('['+regexstr+']','g') : '';
	var translate = regexstr ? function(s){ return dict[s] || s; } : '';
	
	var leafnames = [];
	$.each(leafnodes,function(leafname,obj){ if(obj.type!='ancestral') leafnames.push(leafname) });
	var names = options.includeanc? Object.keys(sequences) : leafnames;
	var specount = names.length, ntcount = model.alignlen();
	if(options.makeids||filetype=='HSAML'){ //replace names with ids (for alignment jobs)
		var seqi=0, parenti=0, tempid='';
		$.each(names,function(j,name){
			if(~leafnames.indexOf(name)){ seqi++; tempid='sequence'+seqi; }
			else { parenti++; tempid='parent'+parenti; }
			nameids[name] = tempid;
		});
	}
	
	if((filetype=='newick'||options.includetree) && treesvg.data){
		var treefile = treesvg.data.root.write(options.tags,!options.includeanc,nameids); 
	} else var treefile = '';
	
	var visiblecols = model.visiblecols();
	var parseseq = function(seqarr){
		var seqstr = '';
		if(options.removehidden){ $.each(visiblecols,function(i,pos){ if(pos==seqarr.length){ return false; } seqstr += seqarr[pos]; }); }
		else seqstr = seqarr.join('');
		return seqstr.replace(regex,translate);
	};
	
	var seqline = '';
	if(filetype=='fasta'){
		$.each(names,function(j,name){
			output += '>'+(nameids[name]||name)+"\n";
			seqline = parseseq(sequences[name]);
			for(var c=0;c<seqline.length;c+=50){ output += seqline.substr(c,50)+"\n"; }
		});
	}
	else if (filetype=='HSAML'){
  		output = "<ms_alignment>\n";
  		if(treefile) output += "<newick>\n"+treefile+"</newick>\n";
		
		output += "<nodes>\n"; var isleaf;
  		$.each(names,function(j,name){
  			isleaf = ~leafnames.indexOf(name);
  			seqline = parseseq(sequences[name]);
    		var xmlnode = isleaf? "\t<leaf " : "\t<node ";
    		xmlnode += "id=\""+(nameids[name]||name)+"\" name=\""+name+"\">\n\t\t<sequence>\n\t\t"+seqline+"\n\t\t</sequence>\n"+(isleaf?"\t</leaf>\n":"\t</node>\n");
    		output += xmlnode;
  		});
  		output += "</nodes>\n";
		output += "</ms_alignment>";
	}
	else if(filetype=='phylip'){
		output = specount+" "+ntcount+"\n";
		$.each(names,function(j,name){
			seqline = parseseq(sequences[name]);
			output += seqline+"\n";	
		});
	}
	else if(filetype=='newick'){ output = treefile; }
	
	if(usemodel||options.exportdata){ //export data to exportwindow & make download url
		if(options.exportdata){
			output = options.exportdata;
			filename = 'exported_subtree.nwk';
			exportmodel.filename(filename);
		} else filename = exportmodel.filename()+exportmodel.fileext();
		$('#exportedwindow .paper').text(output);
		$('#exportwrap').addClass('flipped');
		communicate('makefile',{filename:filename,filedata:output},exportmodel.fileurl);
	}
	else if(options.exporturl){ //export server file to exportwindow
		$.get(options.exporturl+'?text',function(txt){$('#exportedwindow .paper').text(txt)},'text');
		$('#exportwrap').addClass('flipped');
		exportmodel.fileurl(options.exporturl);
		exportmodel.filename(options.exporturl.substr(options.exporturl.lastIndexOf('/')+1));
	}
	if(options.makeids) output += '|'+JSON.stringify(nameids);
	return output;
}

//Save current MSA data to local server (library)
function savefile(btn){
	if(btn){ btn.style.opacity = 0.6; btn.innerHTML = 'Saving'; } else btn = false;
	var filedata = parseexport('HSAML',{includetree:true,includeanc:true,tags:true});
	var nodeinfo = {};
	$.each(leafnodes,function(name,node){ if(node.ensinfo&&node.type!='ancestral') nodeinfo[name] = node.ensinfo; });
	if($.isEmptyObject(nodeinfo)) nodeinfo = '';
	var visiblecols = model.hiddenlen()? model.visiblecols() : '';
	var ensinfo = $.isEmptyObject(model.ensinfo())? '' : model.ensinfo();
	communicate('save', {writemode:exportmodel.savetarget().type, file:filedata, name:exportmodel.savename(), source:model.sourcetype(),
		parentid:model.parentid(), id:model.currentid(), ensinfo:ensinfo, nodeinfo:nodeinfo, visiblecols:visiblecols}, {btn:btn});
	if($("#save").length) setTimeout(function(){ $("#save img.closebtn").click(); },2000);
	return false;
}

/* Rendrering: tree & sequence alignment areas */
function makeColors(){
	colors = [];
	if(!settingsmodel) return;
	var colorscheme = settingsmodel.colorscheme(), seqtype = model.seqtype();
	if(colorscheme!='rainbow' && colorscheme!='greyscale'){
		if(colorscheme=='nucleotides'){
			colors = {A:['','rgb(0,0,255)'], T:['','rgb(255, 255, 0)'], G:['','rgb(0, 255, 0)'], C:['','rgb(255, 0, 0)'], U:['','rgb(255, 255, 0)']};
		}
		else if(colorscheme=='Taylor'){
   			colors = { "A":["","rgb(204, 255, 0)"], "R":["","rgb(0, 0, 255)"], "N":["","rgb(204, 0, 255)"], "D":["","rgb(255, 0, 0)"], "C":["","rgb(255, 255, 0)"], "Q":["","rgb(255, 0, 204)"], "E":["","rgb(255, 0, 102)"], "G":["","rgb(255, 153, 0)"], "H":["","rgb(0, 102, 255)"], "I":["","rgb(102, 255, 0)"], "L":["","rgb(51, 255, 0)"], "K":["","rgb(102, 0, 255)"], "M":["","rgb(0, 255, 0)"], "F":["","rgb(0, 255, 102)"], "P":["","rgb(255, 204, 0)"], "S":["","rgb(255, 51, 0)"], "T":["","rgb(255, 102, 0)"], "W":["","rgb(0, 204, 255)"], "Y":["","rgb(0, 255, 204)"], "V":["","rgb(153, 255, 0)"], "B":["","rgb(255, 255, 255)"], "Z":["","rgb(255, 255, 255)"], "X":["","rgb(255, 255, 255)"]};
   		}
   		else if(colorscheme=='Clustal'){
   			colors = {A:['','rgb(128,160,240)'], R:['','rgb(240,21,5)'], N:['','rgb(0,255,0)'], D:['','rgb(192,72,192)'], C:['','rgb(240,128,128)'], Q:['','rgb(0,255,0)'], E:['','rgb(192,72,192)'], G:['','rgb(240,144,72)'], H:['','rgb(21,164,164)'], I:['','rgb(128,160,240)'], L:['','rgb(128,160,240)'], K:['','rgb(240,21,5)'], M:['','rgb(128,160,240)'], F:['','rgb(128,160,240)'], P:['','rgb(255,255,0)'], S:['','rgb(0,255,0)'], T:['','rgb(0,255,0)'], W:['','rgb(128,160,240)'], Y:['','rgb(21,164,164)'], V:['','rgb(128,160,240)'], B:['','rgb(255,255,255)'], X:['','rgb(255,255,255)'], Z:['','rgb(255,255,255)']};
   		}
   		else if(colorscheme=='Zappo'){
   			colors = {A:['','rgb(255,175,175)'], R:['','rgb(100,100,255)'], N:['','rgb(0,255,0)'], D:['','rgb(255,0,0)'], C:['','rgb(255,255,0)'], Q:['','rgb(0,255,0)'], E:['','rgb(255,0,0)'], G:['','rgb(255,0,255)'], H:['','rgb(100,100,255)'], I:['','rgb(255,175,175)'], L:['','rgb(255,175,175)'], K:['','rgb(100,100,255)'], M:['','rgb(255,175,175)'], F:['','rgb(255,200,0)'], P:['','rgb(255,0,255)'], S:['','rgb(0,255,0)'], T:['','rgb(0,255,0)'], W:['','rgb(255,200,0)'], Y:['','rgb(255,200,0)'], V:['','rgb(255,175,175)'], B:['','rgb(255,255,255)'], X:['','rgb(255,255,255)'], Z:['','rgb(255,255,255)']};
   		}
   		else if(colorscheme=='hydrophobicity'){
   			colors = {A:['','rgb(173,0,82)'], R:['','rgb(0,0,255)'], N:['','rgb(12,0,243)'], D:['','rgb(12,0,243)'], C:['','rgb(194,0,61)'], Q:['','rgb(12,0,243)'], E:['','rgb(12,0,243)'], G:['','rgb(106,0,149)'], H:['','rgb(21,0,234)'], I:['','rgb(255,0,0)'], L:['','rgb(234,0,21)'], K:['','rgb(0,0,255)'], M:['','rgb(176,0,79)'], F:['','rgb(203,0,52)'], P:['','rgb(70,0,185)'], S:['','rgb(94,0,161)'], T:['','rgb(97,0,158)'], W:['','rgb(91,0,164)'], Y:['','rgb(79,0,176)'], V:['','rgb(246,0,9)'], B:['','rgb(12,0,243)'], X:['','rgb(104,0,151)'], Z:['','rgb(12,0,243)']};
   		}
   	}
   	colors['-']=['#ccc',"rgb(255,255,255)"];colors['.']=['#e3e3e3',"rgb(255,255,255)"];colors['?']=['#f00',"rgb(255,255,255)"];
   	if(model.hasdot()) colors['-'][0] = "#999"; //darker del. symbol
   	//var symbolarr = seqtype=='codons'? Object.keys(alphabet.codons) : alphabet[seqtype];
   	for(var i=0;i<letters.length;i++){ //loop over ALL letters
   		var symbol = letters[i];
   		var unmasked = i%2==0 ? true : false;
   		if(colorscheme=='rainbow' || colorscheme=='greyscale'){ //generate all colors
   			var color = unmasked ? rainbow(letters.length,i,colorscheme) : mixcolors(rainbow(letters.length,i-1,colorscheme),[100,100,100]);
   			if(!colors[symbol]){ colors[symbol] = ["",color]; }
   		}
   		else{
   			if(!colors[symbol]){ //make missing color
   				if(unmasked){ colors[symbol] = ["","rgb(200,200,200)"]; } //symbols outside of colorscheme: grey bg
   				else{ colors[symbol] = ["",mixcolors(colors[letters[i-1]][1],[100,100,100])]; } //masked symbols: shade darker
   			}
   		}
   		var rgb = colors[symbol][1].match(/\d{1,3}/g); //adjust letter color for bg brightness
   		var brightness = Math.sqrt(rgb[0]*rgb[0]*.241 + rgb[1]*rgb[1]*.691 + rgb[2]*rgb[2]*.068);
   		var fgcolor = brightness<110 ? "#eee" : "#333";
   		if(!colors[symbol][0]){ colors[symbol][0] = fgcolor; }
   		
   		symbols[symbol] = { 'fgcolor' : colors[symbol][0], 'bgcolor' : colors[symbol][1] };
   		symbols[symbol].masked = unmasked ? letters[i+1] : symbol;
   		symbols[symbol].unmasked = unmasked ? symbol : letters[i-1];
   	} //Result: symbols = { A:{fgcolor:'#ccc',bgcolor:'#fff',masked:'a',unmasked:'A'}, a:{fgcolor,..}}
   	if(seqtype=='codons'){
   		$.each(alphabet.codons, function(codon,aa){
   			var maskaa = symbols[aa].masked, maskcodon = codon.toLowerCase();
   			symbols[codon] = symbols[aa]; symbols[maskcodon] = symbols[maskaa];
   			symbols[codon].masked = maskcodon; symbols[maskcodon].masked = codon;
   			symbols[codon].unmasked = codon; symbols[maskcodon].unmasked = maskcodon;
   		});
   		$.each(alphabet.gaps, function(i,gap){
   			var maskgap = symbols[gap].masked, codon = gap+gap+gap;
   			var maskcodon = maskgap+maskgap+maskgap;
   			symbols[codon] = symbols[gap];
   			symbols[codon].masked = maskcodon;
   			symbols[codon].unmasked = codon;
   		});	
   	}
   	makeCanvases();
}

//Note: a color palette: http://jsfiddle.net/k8NC2/1/ jalview color schemes
//Generates vibrant, evenly spaced colors. Adapted from blog.adamcole.ca
function rainbow(numOfSteps,step,colorscheme){
    var r, g, b;
    var h = step / numOfSteps;
    var i = ~~(h * 6);
    var f = h * 6 - i;
    var q = 1 - f;
    switch(i % 6){
        case 0: r = 1, g = f, b = 0; break;
        case 1: r = q, g = 1, b = 0; break;
        case 2: r = 0, g = 1, b = f; break;
        case 3: r = 0, g = q, b = 1; break;
        case 4: r = f, g = 0, b = 1; break;
        case 5: r = 1, g = 0, b = q; break;
    }
    if(colorscheme=='greyscale') r = g = b = (r+g+b)/3;
    return 'rgb('+parseInt(r*255)+','+parseInt(g*255)+','+parseInt(b*255)+')';
}

function mixcolors(color,mix){ //shade colors (masking)
	var rgb = color.match(/\d{1,3}/g);
	var r = Math.floor((parseInt(rgb[0])+mix[0])/2);
	var g = Math.floor((parseInt(rgb[1])+mix[1])/2);
	var b = Math.floor((parseInt(rgb[2])+mix[2])/2);
	return "rgb("+r+","+g+","+b+")";
}

function redraw(options){
	if(!options) options = {};
	else if(options=='zoom') options = {zoom:true};
	canvaspos = []; colflags = []; rowflags = []; activeid = ''; //clear selections and its flags
	$("#seq div[id*='selection'],#seq div[id*='cross']").remove();
	
	var newheight = model.visiblerows().length ? model.visiblerows().length*model.boxh() : model.leafcount()*model.boxh();
	if(!options.zoom){ dom.treewrap.css('height',newheight); $("#names svg").css('font-size',model.fontsize()+'px'); }
	$label = $("#namelabel"); $labelspan = $("#namelabel span");
	if($.isEmptyObject(treesvg) && !options.zoom){ //no tree loaded
	  if(options.phyloxml||options.newick){ //make tree SVG
		dom.tree.empty(); dom.names.empty();
		dom.wrap.css('left',0); dom.seq.css('margin-top',0);
		dom.tree.css('box-shadow','none');
		dom.treewrap.css('background-color','white');
		
		treesvg = new Smits.PhyloCanvas(options);
		newheight = treesvg.svg.canvasSize[1];
		dom.treewrap.css({top:0,height:newheight});
		var svg = $("#tree>svg,#names>svg");
		svg.mousedown(function(e){ //handle nodedrag on tree
			e.preventDefault();
			var dragged = e.target.tagName;
	  		if(dragged=='circle' || dragged=='tspan'){
	  			var raphid = dragged=='tspan'? e.target.parentNode.raphaelid : e.target.raphaelid;
	  			var svgid = dragged=='tspan'? 'svg2' : 'svg1';
	  			var draggednode = treesvg.svg[svgid].getById(raphid).data('node');
	  			$("#page").one('mouseup',function(){ $("#page").unbind('mousemove'); });
	  			var startpos = {x:e.pageX,y:e.pageY}, dragmode = false, helper;
				$("#page").mousemove(function(evt){
					var dx = evt.pageX-startpos.x, dy = evt.pageY-startpos.y;
	  				if(Math.sqrt(dx*dx+dy*dy)>7){
	  					if(!dragmode){
	  						helper = movenode('drag',draggednode,dragged);
	  						dragmode = true;
	  					}
	  					if(helper) helper.css({left:evt.pageX+15,top:evt.pageY});
	  				}
	  	}); } });
	  } else { //no tree: make tree/leafname placeholders
		dom.tree.empty(); dom.names.empty();
		dom.treewrap.css('background-color','transparent');
		$("#tree").css('box-shadow','-2px 0 2px #ccc inset');
		$.each(model.visiblerows(),function(n,name){
			var leafname = leafnodes[name].ensinfo? leafnodes[name].ensinfo.species : name;
			var nspan = $('<span style="height:'+model.boxh()+'px;font-size:'+model.fontsize()+'px">'+leafname+'</span>');
			
			var hovertimer;
			nspan.mouseenter(function(){ //show full leaf name on mouseover
				if(leafnodes[name].ensinfo) nspan.css('cursor','pointer');
				hovertimer = setTimeout(function(){
					$label.css({
						'font-size' : model.fontsize()+'px',
						'top': nspan.offset().top+'px',
						'left' : $("#right").position().left-14+'px'
					});
					$labelspan.css('margin-left',0-dom.names.innerWidth()+5+'px'); $labelspan.text(leafname);
					$label.css('display','block'); setTimeout(function(){ $label.css('opacity',1) },50);
				},800);
			});
			nspan.mouseleave(function(){ 
				clearTimeout(hovertimer);
				$label.css('opacity',0);
				setTimeout(function(){$label.hide()},500); 
			});
			if(leafnodes[name].ensinfo){ //leaf menu for ensembl info (treeless import)
				var ens = leafnodes[name].ensinfo;
				leafnodes[name].displayname = ens.species;
				nspan.click(function(){
					var ensmenu = {};
					if(ens.taxaname) ensmenu['<span class="note">Taxa</span> '+ens.taxaname] = '';
    				if(ens.cladename&&ens.species) ensmenu['<span class="note">Gene</span> '+
    					'<a href="http://www.ensembl.org/'+ens.species.replace(' ','_')+
    					'/Gene/Summary?g='+ens.cladename+'" target="_blank" title="View in Ensembl">'+ens.cladename+'</a>'] = '';
    				if(ens.accession&&ens.species) ensmenu['<span class="note">Protein</span> '+
    					'<a href="http://www.ensembl.org/'+ens.species.replace(' ','_')+'/Transcript/ProteinSummary?p='+
    					ens.accession+'" target="_blank" title="View in Ensembl">'+ens.accession+'</a>'] = '';
    				hidetooltip();
    				setTimeout(function(){ tooltip('',ens.genetype,{arrow:'top', id:'namemenu', data:ensmenu, 
    						target:{startx:$("#names").offset().left+($("#names").width()/2), starty:nspan.offset().top}, shifty:model.boxh()}) },100);
				});
			}
			
			dom.names.append(nspan);
		});
	  }
	} //no treeSVG
   	if(dom.treewrap.css('display')=='none') setTimeout(function(){dom.treewrap.fadeTo(300,1,'linear')},10);
   	
	var newwidth = model.visiblecols().length*model.boxw();
	if(options.zoom && !options.refresh){//keep sequence positioned in center of viewport after zoom
		dom.seq.empty(); dom.seq.append('<div id="rborder" class="rowborder">');
		var oldwidth = parseInt(dom.seq.css('width')); var oldheight = parseInt(dom.seq.css('height'));
		var left = ((newwidth/oldwidth)*(parseInt(dom.wrap.css('left'))-(dom.seqwindow.innerWidth()/2)))+(dom.seqwindow.innerWidth()/2);
		if(left>0){ left = 0; } else if (Math.abs(left)>newwidth-dom.seqwindow.innerWidth()){ left = dom.seqwindow.innerWidth()-newwidth; }
		var visibleHeight = $("#left").height();
		var top = ((newheight/oldheight)*(parseInt(dom.seq.css('margin-top'))-(visibleHeight/2)))+(visibleHeight/2);
		if(top<0&&newheight>visibleHeight&&Math.abs(top)>newheight-visibleHeight){ top = visibleHeight-newheight; }//keep bottom edge grounded
		if(top>0||newheight<visibleHeight){ top = 0; }//stick to top edge
		if(model.zoomlevel()<3){ dom.treewrap.addClass('minimal'); } else { dom.treewrap.removeClass('minimal'); }
		dom.wrap.css('left',Math.round(left)); dom.seq.css('margin-top',Math.round(top));
		dom.treewrap.animate({height:newheight,top:Math.round(top)},500,'linear');
		if(!$.isEmptyObject(treesvg)) $("#names svg").animate({'font-size':model.fontsize()},500,'linear');
		else $("#names span").css({'height':model.boxh()+'px','font-size':model.fontsize()+'px'});
	}
	if($.isEmptyObject(sequences)) newwidth = newheight = 0;
	dom.seq.css({ 'width':newwidth, 'height':newheight });
	if(!options.treeonly && !$.isEmptyObject(sequences)){ makeRuler(); makeColors(); makeImage('','cleanup'); }
	else if($.isEmptyObject(sequences)){ //no sequence data
		model.visiblecols.removeAll(); model.treealtered(false); model.seqsource(''); model.dnasource({});
		$('#seq .tile').remove(); $('#ruler').empty();
	}
	if(!dom.seqwindow.data("contentWidth")){ mCustomScrollbar(0,"easeOutCirc","auto","yes","yes",10); }
	else { $(window).trigger('resize'); }
}

function refresh(e){ //redraw tree => sequence
	if(e){ e.stopPropagation(); $('html').click(); } //hide tooltips
	if(treesvg.refresh) treesvg.refresh();
};

function cloneCanvas(oldCanvas){ //make a copy of a canvas element
	var newCanvas = document.createElement('canvas');
	newCanvas.width = oldCanvas.width;
	newCanvas.height = oldCanvas.height;
    var context = newCanvas.getContext('2d');
	context.drawImage(oldCanvas,0,0);
	return newCanvas;
}

function makeCanvases(){ //make canvases of sequence letters
	$.each(symbols,function(symbol,data){
		var tmpel = document.createElement('canvas');
		tmpel.width = model.boxw();
		tmpel.height = model.boxh();
		var tmpcanv = tmpel.getContext('2d');
		tmpcanv.fillStyle = data.bgcolor;
		if(model.zoomlevel()==1){ tmpcanv.fillRect(0,0,model.symbolw(),2); }
		else{
			if(settingsmodel.roundcorners() && model.zoomlevel()>4){ //round corners
				var x=1,y=1,w=tmpel.width-1,h=tmpel.height-1,r=parseInt(model.boxw()/5);
				tmpcanv.beginPath();
  				tmpcanv.moveTo(x+r, y);
  				tmpcanv.arcTo(x+w, y, x+w, y+h, r);
  				tmpcanv.arcTo(x+w, y+h, x, y+h, r);
  				tmpcanv.arcTo(x, y+h, x, y, r);
  				tmpcanv.arcTo(x, y, x+w, y, r);
  				tmpcanv.closePath();
  				tmpcanv.fill();
			}
			else tmpcanv.fillRect(1,1,tmpel.width-1,tmpel.height-1);
		}
		if(model.fontsize() > 7){ //draw characters
			tmpcanv.font = model.fontsize()+'px '+settingsmodel.font();
			tmpcanv.textAlign = 'center';
			tmpcanv.textBaseline = 'middle';
			tmpcanv.fillStyle = data.fgcolor;
			if(model.fontsize() > 12){ //font shadow
			  if(data.fgcolor=="#eee"){
				tmpcanv.shadowColor = "#111";
				tmpcanv.shadowOffsetX = 0;
				tmpcanv.shadowOffsetY = 1.5;
				tmpcanv.shadowBlur = 1;
			  }
			  else if(data.fgcolor=="#333"){
				tmpcanv.shadowColor = "#fff";
				tmpcanv.shadowOffsetX = 0;
				tmpcanv.shadowOffsetY = -1;
				tmpcanv.shadowBlur = 1.5;
			  }
			}
			var l, symbolarr = symbol.split('');
			var colw = tmpel.width/(symbolarr.length+1);
			$.each(symbolarr,function(i,letter){
				if(canvassymbols[letter]) letter = canvassymbols[letter];
				tmpcanv.fillText(letter, colw*(i+1)+1, tmpel.height/2);
			});
		}
		symbols[symbol]['canvas'] = tmpel;
		if(model.zoomlevel()==10) symbols[symbol]['refcanvas'] = tmpel;
	});
	//$.each(symbols,function(i,data){$('#top').append(' ',data.canvas)}); //Debug
}

// render sequence tiles //
function makeImage(target,cleanup){
	var targetx,targety;
	if(target){
		var tarr = target.split(':');
		if(tarr[0]=='x'){ targetx = parseInt(tarr[1]); } else if(tarr[0]=='y'){ targety = parseInt(tarr[1]); }
	}
	if(!targetx){ if(!$("#wrap").position()) return; targetx = $("#wrap").position().left; }
	if(!targety){ targety = parseInt(dom.seq.css('margin-top')); }
	var colstartpix = parseInt((0-targetx)/model.boxw());
	var rowstartpix = parseInt((0-targety)/model.boxh());
	var colstart = colstartpix-(colstartpix%colstep); //snap to (colstep-paced) tile grid
	var colend = parseInt((dom.seqwindow.innerWidth()-targetx)/model.boxw());
	var visiblecols = model.visiblecols();
	if(colend>visiblecols.length) colend = visiblecols.length;
	if($('#seqtool').length) toolsmodel.hidelimit.valueHasMutated(); //seqtool window => update column preview
	var rowstart = rowstartpix-(rowstartpix%rowstep); //snap to grid
	var rowend = parseInt(((dom.seqwindow.innerHeight()-$("#ruler").outerHeight())-targety)/model.boxh());
	if(rowend>model.visiblerows().length){ rowend = model.visiblerows().length; }
	var rowdraws = {};
	var canvascount = 0; //rendering 4-6 tiles => show spinner
	var totalcount = 0;
	for(var row = rowstart; row<rowend; row+=rowstep){ //loop over canvas grid
	  for(var col = colstart; col<colend; col+=colstep){
		if(canvaspos.indexOf(row+'|'+col)==-1){ //canvas not yet made
			canvaspos.push(row+'|'+col);
			rowdraws[row+'|'+col] = {};
			rowdraws[row+'|'+col].canvasrow = row;
			rowdraws[row+'|'+col].row = row;
			rowdraws[row+'|'+col].col = col;
			totalcount++;
			setTimeout(function(r,c){ return function(){
				canvascount++;
				var canvas = document.createElement('canvas');
				var tile = $('<div class="tile">');
				canvas.width = colstep*model.boxw();
				canvas.height = rowstep*model.boxh();
				var endrow = rowdraws[r+'|'+c].row+rowstep>model.visiblerows().length? model.visiblerows().length : rowdraws[r+'|'+c].row+rowstep;
				canvas.setAttribute('id',r+'|'+c);
				var canv = canvas.getContext('2d');		
				canv.fillStyle = 'white';
				canv.fillRect(0,0,canvas.width,canvas.height);
				while(rowdraws[r+'|'+c].canvasrow < endrow){ //draw rows of sequence to the tile
					var seqdata = sequences[model.visiblerows()[rowdraws[r+'|'+c].canvasrow]];
					if(!seqdata){ rowdraws[r+'|'+c].canvasrow++; continue; } //no sequence data: skip row
					var endcol = rowdraws[r+'|'+c].col+colstep>visiblecols.length? visiblecols.length : rowdraws[r+'|'+c].col+colstep;
					for(var canvascol=c;canvascol<endcol;canvascol++){
						seqletter = seqdata[visiblecols[canvascol]];
						if(!seqletter) continue; else if(!symbols[seqletter]) symbols[seqletter] = symbols['?'];
						canv.drawImage( symbols[seqletter]['canvas'], (canvascol - rowdraws[r+'|'+c].col)*model.boxw()+1, (rowdraws[r+'|'+c].canvasrow - rowdraws[r+'|'+c].row)*model.boxh()+1);
					}
					rowdraws[r+'|'+c].canvasrow++;
				}
				tile.css({'left': c*model.boxw()+'px', 'top': r*model.boxh()+'px'});
				dom.seq.append(tile);
				tile.append(canvas);
				rowdraws[r+'|'+c] = {};
				setTimeout(function(){ tile.css('opacity',1) },50);
				setTimeout(function(){ //remove obsolete tiles
					var pos1 = tile.position(); var prevdivs = tile.prevAll('.tile');
					prevdivs.each(function(){
						var pos2 = $(this).position(); 
						if(cleanup||pos1==pos2) $(this).remove();
					})
					if(cleanup) cleanup = false;
				},1000);
				if(canvascount==totalcount){ if($("#spinner").css('display')=='block' ){ setTimeout(function(){$("#spinner").fadeOut(200);},50); } }
			}}(row,col),10);
		}//make canvas	
	  }//for cols
	}//for rows
	if(totalcount>3){ $("#spinner").css({display:'block',opacity:1}); }
}


function makeRuler(){
	var $ruler = $("#ruler");
	$ruler.empty();
	var tick = 10, tickw = tick*model.boxw()-4, k = '', visiblecols = model.visiblecols();
	var markerdiv = function(scol,ecol){ //func. to make markers for hidden columns
		var gapindex = scol==0 ? 0 : visiblecols.indexOf(scol-1)+1;
		var l = gapindex*model.boxw()-8;
		var colspan = ecol-scol;
		var sclass = colspan==1? 'small': colspan>5? 'big' : '';
		var div = $('<div class="marker '+sclass+'" style="left:'+l+'px">&#x25BC<div>|</div></div>');
		div.mouseenter(function(e){ tooltip(e,'Click to reveal '+colspan+' hidden column'+(colspan==1?'':'s')+'.',{target:div[0]}) });
		div.click(function(){ showcolumns([[scol,ecol]],'hidetip'); redraw(); });
		return div;
	}
	if(visiblecols[0]!==0) $ruler.append(markerdiv(0,visiblecols[0]));
	for(var t=0;t<visiblecols.length-1;t++){
		if((visiblecols[t+1]-visiblecols[t])!=1){ //a column gap => add marker
			if(visiblecols[t+1]<=visiblecols[t]){ //columns array corrupt. clean up array. redraw.
				visiblecols.sort(function(a,b){return a-b});
				for(var i=1;i<visiblecols.length;i++){ if(visiblecols[i-1]==visiblecols[i]) visiblecols.splice(i,1); }
				redraw(); return;
			}
			$ruler.append(markerdiv(visiblecols[t]+1,visiblecols[t+1]));
		}
	  	if(t%tick==0){ //make ruler tickmarks
			k = t;
			if(t+tick>visiblecols.length) tickw = (visiblecols.length%tick)*model.boxw()-4;
			if(model.boxw()<4){ if(t%100==0){ if(t>=1000){ k = '<span>'+(t/1000)+'K</span>'; }else{ k = '<span>'+t+'</span>'; } }else{ k = '&nbsp;'; } }
			$ruler.append($('<span style="width:'+tickw+'px">'+k+'</span>'));
		}
	}
	if(visiblecols[visiblecols.length-1] != model.alignlen()-1) $ruler.append(markerdiv(visiblecols[visiblecols.length-1]+1,model.alignlen()));
}

function zoomin(){
	if(model.zoomlevel()<20){ model.zoomlevel(model.zoomlevel()+2); redraw('zoom'); }
}
function zoomout(){
	if(model.zoomlevel()>3){ model.zoomlevel(model.zoomlevel()-2); redraw('zoom'); }
}


function movenode(drag,movednode,movedtype){ //Create 'move node' mode (tree branches accept click/drop)
	if(!movednode) return false;
	$("#left").addClass('dragmode');
	$("#namesborderDragline").addClass('dragmode');
	movednode.highlight(true);
	setTimeout(function(){ //explanation popup
		tooltip('','Move node: '+(drag?'drop node to':'click on')+' target branch or node.',{target:{startx:200,starty:100},arrow:'bottom',autohide:6000});
	}, 400);
	if(drag){
		$("#right").addClass('dragmode');
		setTimeout(function(){
			tooltip('','Delete node: drop node here.',{target:{startx:900,starty:105},arrow:'bottom',autohide:6000});
		}, 400);
	  	if(movedtype=='circle'){ //add drag helper (node preview)
	  		var helper = $(movednode.makeCanvas()).attr('id','draggedtree');
	  	}
	  	else if(movedtype=='tspan'){
	  		var helper = $('<div id="draggedlabel">'+(movednode.displayname||movednode.name)+'</div>');
	  	}
	  	$("body").append(helper);
	}//drag
	
	var drawtimer = 0, maxscroll = ($("#seq").height()+10)-($("#left").innerHeight()+3);
	var vertdragger = $("#verticalDragger .dragger");
	var draggerscale = maxscroll/($("#verticalDragger").height()-vertdragger.height());
	function loop(rate){ //treescroll
		var scrollto = parseInt(dom.treewrap.css('top'))+rate;
		if(scrollto > 0) scrollto = 0; else if(Math.abs(scrollto) > maxscroll) scrollto = 0-maxscroll;
    	dom.treewrap.stop(1).animate({top:scrollto}, 1000, 'linear', function(){ loop(rate) });
    	dom.seq.stop(1).animate({marginTop: scrollto}, 1000, 'linear');
    	vertdragger.stop(1).animate({top: (0-scrollto)/draggerscale}, 1000, 'linear');
	}        
	function stop(){ $('#treewrap,#seq,#verticalDragger .dragger').stop(1); clearInterval(drawtimer); }
	$.each(['up','down'],function(i,dir){ //set up hoverable scrollbuttons
	  	var scrolldiv = $('<div class="treescroll '+dir+'" style="width:'+($("#right").offset().left-30)+'px">'+(dir=='up'?'\u25B2':'\u25BC')+'</div>');
	  	$("#page").append(scrolldiv);
	  	var baseline = scrolldiv.offset().top;
	  	scrolldiv.mouseenter(function(){ drawtimer = setInterval(function(){ makeImage() }, 2000) });
	  	scrolldiv.mousemove(function(event){
	  		var rate = dir=='up'? scrolldiv.outerHeight()-(event.pageY-baseline) : 0-(event.pageY-baseline);
	  		if(rate%2 != 0) loop(rate*10);
	  	});
	  	scrolldiv.mouseleave(function(){ stop() });
	});
	  	
	$("body").one('mouseup',function(evnt){ //mouse release
		var targettype = evnt.target.tagName;
	  	if(targettype=='circle'||targettype=='tspan'||(targettype=='line'&&$(evnt.target).attr('class')=='horizontal')){
	  		var raphid = targettype=='tspan'? evnt.target.parentNode.raphaelid : evnt.target.raphaelid;
	  		var svgid = targettype=='tspan'? 'svg2' : 'svg1';
	  		var targetnode = treesvg.svg[svgid].getById(raphid).data('node');
	  		if(movednode && targetnode){ movednode.move(targetnode); refresh(); }
	  	}
	  	else if (drag && targettype=='DIV' && evnt.target.id=='treebin'){ if(movednode) movednode.remove(); refresh(); }
	  	movednode.highlight(false);
	  	$("#left,#right,#namesborderDragline").removeClass('dragmode');
	  	$("div.treescroll").remove(); stop();
	  	if(drag) helper.remove();
	  	$("#page").unbind('mousemove'); hidetooltip();
	 });
	 if(drag) return helper;
}

function tooltip(evt,title,options){ //make tooltips & pop-up menus
	if(!options) options = {};
	if(typeof(title)=='string') title = title.replace(/#/g,'');
	if(options.tooltip){ //use existing tooltip
		var tipdiv = $(options.tooltip);
		var tiparrow = $(".arrow",tipdiv);
		var tiptitle = $(".tooltiptitle",tipdiv);
		var tipcontentwrap = $(".tooltipcontentwrap",tipdiv);
		var tipcontent = $(".tooltipcontent",tipdiv);
		tipdiv.css('display','block');
	} else { //generate new tooltip
		var tipdiv = $('<div class="tooltip"></div>');
		var tiparrow = $('<div class="arrow"></div>');
		var tiptitle = $('<div class="tooltiptitle"></div>');
		var tipcontentwrap = $('<div class="tooltipcontentwrap"></div>');
		var tipcontent = $('<div class="tooltipcontent"></div>');
		tipcontentwrap.append(tipcontent);
		tipdiv.append(tiparrow,tiptitle,tipcontentwrap);
		var box = options.container || 'body';
		$(box).append(tipdiv);
	}
	if(options.id) tipdiv.attr('id',options.id);
	if(!title) tiptitle.css('display','none');
	
	if(options['arrow']){ //add pointer
		var arr = options.arrow;
		tipdiv.addClass(arr+'arrow');
	} else var arr = false;
	var tipstyle = options.style||settingsmodel.tooltipclass()||'';
	
	var node = options.target || {};
	if(tipstyle!='none') tipdiv.addClass(tipstyle); //custom style
	var x = !isNaN(node.startx)? node.startx:evt.pageX, y = !isNaN(node.starty)? node.starty:evt.pageY;
	if(!$.isEmptyObject(node)){ //place according to target element
		if(node.jquery) node = node[0];
		if(!node.width) node.width = 0; if(!node.height) node.height = 0;
    	if(node.edgeCircleHighlight){
    		x = $(node.edgeCircleHighlight.node).offset().left+25;
    		y = $(node.edgeCircleHighlight.node).offset().top-7;
    	}
    	else if(node.tagName){ //target DOM element
    		var elem = $(node);
    		if(!node.width) node.width = elem.width();
    		if(!node.height) node.height = elem.height();
    		if(node.tagName=='LI'){ //place as submenu
    			x = elem.innerWidth()-2;
    			y = elem.position().top-2;
    			if(tipstyle=='white') y-= 1;
    		}
    		else{ //place next to element
    			x = elem.offset().left+15;
    			y = elem.offset().top+10;
    			if(elem.hasClass('svgicon')){ x+=17; y-=13; }
    			if(!arr) y+= node.height;
    		}
    	}
    	if(arr=='top') y+=node.height+10;
    } else { x+=5; y+=5; } //place next to cursor
    x+=options.shiftx||0; y+=options.shifty||0;
    var rightedge = $('body').innerWidth()-200;
    if(!options.container && x > rightedge) x = rightedge;
    if(!options.svg) tipdiv.css({left:parseInt(x),top:parseInt(y)});
    	
    if(options.data){ //generate pop-up menu
      if(options.svg && node.edgeCircleHighlight){ //tree node popup menu
      	var hiddencount = node.leafCount - node.visibleLeafCount;
    	var nodeicon = $('<span class="right">'+(hiddencount?' <span class="svgicon" style="padding-right:0" title="Hidden leaves">'+svgicon('hide')+'</span>'+hiddencount : '')+'</span>');
    	if(hiddencount && node.name.length>10) nodeicon.css({position:'relative',right:'0'});
    	var infoicon = $('<span class="svgicon">'+svgicon('info')+'</span>').css({cursor:'pointer'}); //info icon
    	infoicon.mouseenter(function(e){ //hover infoicon=>show info
    		var nodeul = $('<ul>');
    		if(node.children.length) nodeul.append('<li>Visible leaves: '+node.visibleLeafCount+'</li>');
    		if(hiddencount) nodeul.append('<li>Hidden leaves: '+hiddencount+'</li>');
    		nodeul.append('<li>Branch length: '+(Math.round(node.len*1000)/1000)+'</li>','<li>Length from root: '+(Math.round(node.lenFromRoot*1000)/1000)+'</li>','<li>Levels from root: '+node.level+'</li>');
    		if(node.confidence) nodeul.append('<li>Branch support: '+node.confidence+'</li>');
    		if(node.events){ //gene evol. events (ensembl)
    			if(node.events.duplications) nodeul.append('<li>Duplications: '+node.events.duplications+'</li>');
    			if(node.events.speciations) nodeul.append('<li>Speciations: '+node.events.speciations+'</li>');
    		}
    		if(node.taxaid) nodeul.append('<li>Taxonomy ID: '+node.taxaid+'</li>');
    		if(node.ec) nodeul.append('<li>EC number: '+node.ec+'</li>');
    		var nodetip = tooltip(e,'',{target:infoicon[0],data:nodeul[0],arrow:'left',style:'nomenu'});
    		nodeicon.one('mouseleave',function(){ hidetooltip(nodetip) });
    	});
    	nodeicon.append(infoicon);
    	var hovertitle = node.species? 'title="Taxa '+node.name+'"': node.name.length>12? 'title="'+node.name+'"': '';
    	if(!node.parent && !node.species) title = 'Root';
    	title = '<span class="title" '+hovertitle+'">'+title+'</span>'; //limits too long titles
    	tiptitle.html(title); //replace previous tooltip with menu header
    	tiptitle.append(nodeicon);
    	var ul = $('<ul>');
    	var listyle = node.parent?'style="border-radius:0"':'style="border-radius:0;color:#888"';
    	var hideli = $('<li class="arr" '+listyle+'><span class="svgicon" title="Collapse node and its children">'+svgicon('hide')+'</span>Hide this node <span class="right">\u25B8</span></li>');
    	hideli.click(function(){ node.hideToggle(); refresh(); });
    	var hidemenu = {};
    	$.each(node.children,function(i,child){ //child nodes submenu
    		if (child.type == 'ancestral') return true; //skip anc.
    		var litxt = '<span class="svgicon" title="(Un)collapse a child node">'+(i==0?svgicon('upper'):svgicon('lower'))+'</span>'+(child.hidden?'Show ':'Hide ')+(i==0?'upper ':'lower ')+' child';
    		hidemenu[litxt] = {click:function(e){child.hideToggle(); refresh(e)}};
    		if(child.children.length && child.hidden){ //preview hidden children
    			var createpreview = function(){ //create treepreview on the fly
    				var preview = $('<span style="margin-left:5px" class="svgicon">'+svgicon('view')+'</span>');
    				var ptip = '';
    				preview.mouseenter(function(e){
    					var pcanvas = child.makeCanvas();
    					pcanvas.style.borderRadius = '2px';
    					ptip = tooltip(e,'',{target:preview[0],data:pcanvas,arrow:'left',style:'none'});
    					preview.one('mouseleave',function(){ hidetooltip(ptip); });
    				});
    				return preview;
    			}
    			hidemenu[litxt]['append'] = createpreview;
    		}
    	});
    	hidemenu['<span class="svgicon" title="Uncollapse all child nodes">'+svgicon('children')+'</span>Show all children'] = function(e){ node.showSubtree(); refresh(e); };
    	hideli.mouseenter(function(evt){ tooltip(evt,'',{target:hideli[0],data:hidemenu,style:'none'}); });
    	var ancnode = node.children[node.children.length-2];
    	if(ancnode.type=='ancestral'){ //ancestral nodes submenu
    		var h = ancnode.hidden? 'Show':'Hide';
    		var ancli = $('<li class="arr"><span class="svgicon" title="'+h+' ancestral sequence">'+svgicon('ancestral')+'</span>'+h+' ancestral seq. <span class="right">\u25B8</span></li>');
    		ancli.click(function(){ ancnode.hideToggle(); refresh(); });
    		var ancmenu = {};
    		ancmenu['<span class="svgicon" title="Show ancestral sequences of the whole subtree">'+svgicon('ancestral')+'</span>Show subtree ancestors'] = function(e){ node.showSubtree('anc'); refresh(e); };
    		ancmenu['<span class="svgicon" title="Hide ancestral sequences of the whole subtree">'+svgicon('ancestral')+'</span>Hide subtree ancestors'] = function(e){ node.showSubtree('anc','hide'); refresh(e); };
    		ancli.mouseenter(function(evt){ tooltip(evt,'',{target:ancli[0],data:ancmenu,style:'none'}); });
    	} else var ancli = '';
    	var swapli = $('<li style="border-top:1px solid #999"><span class="svgicon" title="Swap places of child nodes">'+svgicon('swap')+'</span>Swap children</li>');
    	swapli.click(function(){ node.swap(); refresh(); });
    	if(node.visibleLeafCount>2){
    		var laddermenu = {};
    		laddermenu['<span class="svgicon" title="Reorder the subtree">'+svgicon('ladderize')+'</span>Ladderise subtree'] = function(e){ node.ladderize(); refresh(e); };
    		swapli.addClass('arr').append('<span class="right">\u25B8</span>');
    		swapli.mouseenter(function(evt){ tooltip(evt,'',{target:swapli[0],data:laddermenu,style:'none',shifty:1}); });
    	}
    	var moveli = node.parent? $('<li><span class="svgicon" title="Graft this node to another branch in the tree">'+svgicon('move')+'</span>Move node</li>') : '';
    	if(moveli) moveli.click(function(){ movenode('',node,'circle'); });
    	var rerootli = node.parent? $('<li><span class="svgicon" title="Place this node as the tree outgroup">'+svgicon('root')+'</span>Place root here</li>') : '';
    	if(rerootli) rerootli.click(function(){ node.reRoot(); refresh(); });
    	var remli = node.parent? $('<li><span class="svgicon" title="Remove this node and its children from the tree">'+svgicon('trash')+'</span>Remove node</li>') : '';
    	if(remli){
    		remli.click(function(){ node.remove(); refresh(); });
    		if(node.leafCount>2){
    			var prunemenu = {};
    			prunemenu['<span class="svgicon" title="Remove all nodes except this subtree">'+svgicon('prune')+'</span>Prune subtree'] = function(e){ node.prune(); refresh(e); };
    			remli.addClass('arr').append('<span class="right">\u25B8</span>');
    			remli.mouseenter(function(evt){ tooltip(evt,'',{target:remli[0],data:prunemenu,style:'none'}); });
    		}
    	}
    	var expli = $('<li style="border-top:1px solid #999"><span class="svgicon" title="Export this subtree in newick format">'+svgicon('file')+'</span>Export subtree</li>');
    	expli.click(function(){ hidetooltip(tipdiv); dialog('export',{exportdata:node.write()}); });
    	ul.append(hideli,ancli,swapli,moveli,rerootli,remli,expli);
    	tipcontent.append(ul);
    	tipcontentwrap.css({'overflow':'hidden','height':tipcontent.innerHeight()+1+'px'}); //slidedown
    	setTimeout(function(){tipcontentwrap.css('overflow','visible')},300);
      }
      else{ //general pop-up menu
      	if(options.data.tagName) tipcontent.append(options.data); //DOM element in tooltip
      	else{ //list-type menu
      		var ul = $('<ul>');
      		var hassubmenu = false;
    		$.each(options.data,function(txt,obj){
    			var li = $('<li>');
	    		if(typeof(obj)=='object'){
    				if(typeof li.click=='function') li.click(obj.click);
    				if(obj.submenu && !$.isEmptyObject(obj.submenu)){ //nested submenu
    					li.html(txt+' <span class="right">\u25B8</span>');
    					li.addClass('arr');
    					li.mouseenter(function(evt){ tooltip(evt,'',{target:li[0],data:obj.submenu}) }); 
	    			}
	    			else li.html(txt);
    				if(obj.mouseover){ li.mouseenter(obj.mouseover); }
    				if(obj.mouseout){ li.mouseleave(obj.mouseout); }
    				if(obj.append){ li.append(obj.append); }
    			}
	    		else{
    				li.html(txt);
    				if(typeof obj=='function') li.click(obj);
				}
				ul.append(li);
    		});
    		tipcontent.append(ul);
	    	if(title){ tiptitle.text(title); $('li:first-child',ul).css('border-radius',0); }else{ tiptitle.css('display','none'); ul.css('border-top','none'); }
    		if(node.tagName && node.tagName == 'LI'){//submenu
    			$(node).append(tipdiv);
		   		$(node).one('mouseleave',function(){ hidetooltip(tipdiv); }); 
    		}
      		$('html').one('click', function(){ hidetooltip('','','seqmenu'); if(node.treenode) node.treenode.highlight(false); });
     	}
   	  }
   }
   else{ //simple tooltip
		if(!node.parent&&node.len&&!node.species){ title = 'Root node'; } //tree tooltip
    	tiptitle.empty().append(title);
    	if(node.nodeType) $(node).mouseleave(function(){ hidetooltip(tipdiv); }); //self-hide
    	else if(!node.edgeCircleHighlight&&!options.nohide) setTimeout(function(){ hidetooltip(tipdiv) },options.autohide||3000);
   }
   if(arr=='top'||arr=='bottom'){ //center arrowed tooltip 
   		var adj = tipdiv.innerWidth()/2; 
   		if(node.width) adj-=(node.width)/2; 
   		tipdiv.css('left','-='+adj);
   		if(arr=='bottom') tipdiv.css('top','-='+(tipdiv.innerHeight()+19));
   }
   tipdiv.addClass('opaque');
   return tipdiv;
}

function hidetooltip(tooltip,exclude,seqmenu){
	if(seqmenu){ //clear sequence menu => cleanup
		$("#rborder").removeClass('opaque'); $("#rborder").css('display','none');
		$("#seq div[class^='selection']").css({'border-color':'','color':''}); activeid = '';
		if(model.selmode()=='default') setTimeout(function(){$("#seq div.selectioncross").css('display','none')},500);
	}
	tooltips = tooltip&&!exclude ? $(tooltip) : $("div.tooltip");
	if(exclude) tooltips = tooltips.not(tooltip);
	tooltips.each(function(){
		var tip = $(this);
		tip.removeClass('opaque');
		if(tip.attr('id')&&tip.attr('id')!='namemenu'){ 
			setTimeout(function(){
				tip.css('display','none');
				$(".tooltipcontent",tip).empty(); 
				if($(".tooltipcontentwrap",tip).hasClass('hidden')) $(".tooltipcontentwrap",tip).css('height',0); 
			},300);
		}
		else setTimeout(function(){ tip.remove(); },500);
	});
}

function selectionsize(e,id,type){ //make or resize a sequence selection box
	if(typeof(type)=='undefined'){ var type = 'rb', start = {}; }
	else if(typeof(type)=='object'){ //type => mouse startpos{x,y} || columns [start,end]
		var start = type.length? {x:type[0]*model.boxw(),w:type[1]-type[0]} : type.x&&type.y? {x:type.x,y:type.y} : {x:0,y:0};
		if(type.length && (type[1]*model.boxw()<Math.abs(dom.wrap.position().left) || type[0]*model.boxw()>Math.abs(dom.wrap.position().left)+dom.seqwindow.innerWidth())) return; //outside of seqwindow
		if(e){
			var dx = e.pageX-type.x, dy = e.pageY-type.y;
			if(dx<10||dy<10) return; else type = 'rb';
		}
	}
	id = id || activeid;
	if(!id){ //create new selectionbox
		id = activeid = $("div[id^='selection']").length+1;
		var x=0, y=0, w=1, h=1;
		dom.seq.append('<div id="selection'+id+'" class="selection"><div class="description"></div><div class="ltresize"></div><div class="rbresize"></div></div>\
			<div id="vertcross'+id+'" class="selectioncross"><div class="lresize"></div><div class="rresize"></div></div>\
			<div id="horicross'+id+'" class="selectioncross"><div class="tresize"></div><div class="bresize"></div></div>');
		if(typeof(type)=='object'){ //coordinates given
			x = start.x||x;
			y = start.y||model.boxh()*model.visiblerows().length-model.boxh();
			w = start.w||w;
			activeid = '';
		}
		else{ //coordinates from mouse
			x = (start.x||e.pageX)-dom.seq.offset().left-2;
			y = (start.y||e.pageY)-dom.seq.offset().top;
		}
		x = x-(x%model.boxw()); y = y-(y%model.boxh()); //snap to grid
		if(x<0) x=0; if(y<0) y=0;
		$("#selection"+id).css({'left':x,'top':y,'width':model.boxw()*w,'height':model.boxh()*h,'display':'block'});
		$("#vertcross"+id).css({'left':x,'top':'0','width':model.boxw()*w,'height':dom.seq.innerHeight(),'display':model.selmode()=='columns'?'block':'none'});
		$("#horicross"+id).css({'left':'0','top':y,'width':dom.seq.innerWidth(),'height':model.boxh()*h,'display':model.selmode()=='rows'?'block':'none'});
		dom.seqwindow.mouseup(function(){ //attach resize handles
			$("#selection"+id).mouseenter(function(){ $("#selection"+id+" div.rbresize, #selection"+id+" div.ltresize").css('opacity','1'); });
			$("#selection"+id).mouseleave(function(){ $("#selection"+id+" div.rbresize, #selection"+id+" div.ltresize").css('opacity','0'); });
			$("#vertcross"+id).mouseenter(function(){ $("#vertcross"+id+" div.lresize, #vertcross"+id+" div.rresize").css('opacity','1'); });
			$("#vertcross"+id).mouseleave(function(){ $("#vertcross"+id+" div.lresize, #vertcross"+id+" div.rresize").css('opacity','0'); });
			$("#horicross"+id).mouseenter(function(){ $("#horicross"+id+" div.tresize, #horicross"+id+" div.bresize").css('opacity','1'); });
			$("#horicross"+id).mouseleave(function(){ $("#horicross"+id+" div.tresize, #horicross"+id+" div.bresize").css('opacity','0'); });
			$("#selection"+id+" div.rbresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'rb'); });
			});
			$("#selection"+id+" div.ltresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'lt'); });
			});
			$("#vertcross"+id+" div.rresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'r'); });
			});
			$("#vertcross"+id+" div.lresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'l'); });
			});
			$("#horicross"+id+" div.bresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'b'); });
			});
			$("#horicross"+id+" div.tresize").mousedown(function(){
				dom.seqwindow.mousemove(function(evt){ selectionsize(evt,id,'t'); });
			});
		});
	} else { //resize existing selection
		var over = e.target.id ? e.target : e.target.parentNode;
		if(over.tagName=='DIV'&&id!=over.id.substr(0-id.toString().length)){ return false; }//avoid overlap
		var seldiv = $("#selection"+id);
		if(!seldiv.length) return;
		if(type!='b'&&type!='t'){
			if(type=='r'||type=='rb'){
				var w = e.pageX-seldiv.offset().left-5;
				w = w-(w%model.boxw())+model.boxw();
			} else if(type=='l'||type=='lt'){
				var l = e.pageX-seldiv.parent().offset().left+5;
				l = l-(l%model.boxw());
				var redge = seldiv.position().left+seldiv.innerWidth();
				if(l>redge-model.boxw()){ l=redge-model.boxw(); }
				var w = redge-l;
				seldiv.css('left',l);
				$("#vertcross"+id).css('left',l);
			}
			if(w<model.boxw()){ w = model.boxw(); }
			seldiv.css('width',w);
			$("#vertcross"+id).css('width',w);
		}
		if(type!='r'&&type!='l'){
			if(type=='b'||type=='rb'){
				var h = e.pageY-seldiv.offset().top-5;
				h = h-(h%model.boxh())+model.boxh();
			} else if(type=='t'||type=='lt'){
				var t = e.pageY-seldiv.parent().offset().top+5;
				t = t-(t%model.boxh());
				var bedge = seldiv.position().top+seldiv.innerHeight();
				if(t>bedge-model.boxh()){ t=bedge-model.boxh(); }
				var h = bedge-t;
				seldiv.css('top',t);
				$("#horicross"+id).css('top',t);
			}
		 	if(h<model.boxh()){ h = model.boxh(); }
			seldiv.css('height',h);
			$("#horicross"+id).css('height',h);
		}
		if(seldiv.innerHeight()>20 && seldiv.innerWidth()>40){//show selection size
			if(seldiv.innerWidth()>140){ var r=' rows | ',c=' columns';}else{ var r='x',c=''; }
			$("#selection"+id+' div.description').css('display','block'); 
			$("#selection"+id+' div.description').text(parseInt(seldiv.innerHeight()/model.boxh())+r+parseInt(seldiv.innerWidth()/model.boxw())+c);
		} else { $("#selection"+id+' div.description').css('display','none'); }
	}
}

function registerselections(id){//set flags in seq. selection vectors
	colflags = []; rowflags=[]; selections = [];
	var selector = id ? '#selection'+id : 'div[id^="selection"]';
	$(selector).each(function(){
		var sel = $(this);
		var colstart = parseInt(sel.position().left/model.boxw());
		var colend = parseInt((sel.position().left + sel.width())/model.boxw());
		var rowstart = parseInt(sel.position().top/model.boxh());
		var rowend = parseInt((sel.position().top + sel.height())/model.boxh());
		for(var c=colstart;c<colend;c++){ colflags[c] = 1; }
		for(var r=rowstart;r<rowend;r++){ rowflags[r] = 1; }
		selections.push({'rowstart':rowstart,'rowend':rowend,'colstart':colstart,'colend':colend});
	});
}

function clearselection(id){
	id = typeof(id)=='undefined' ? false : id;
	if(id){ $("#selection"+id).remove(); $("#vertcross"+id).remove(); $("#horicross"+id).remove(); }
	else{ $("#seq div[id*='selection'],#seq div[id*='cross']").remove(); }
	activeid = '';
}

function toggleselection(type,id,exclude){ //toggle row/column selection
	if(typeof id=='undefined') id=''; if(typeof exclude=='undefined') exclude='';
	if(type=='default'){ toggleselection('hide rows',id); type='hide columns'; } //actions for selection mode change
	else if(type=='columns'){ toggleselection('hide rows',id); type='show columns'; }
	else if(type=='rows'){ toggleselection('show rows',id); type='hide columns'; }
	var divs = ~type.indexOf('rows')? $('div[id^="horicross'+id+'"]') : $('div[id^="vertcross'+id+'"]');
	if(exclude) divs = divs.not('div[id$="cross'+exclude+'"]'); //filter out some divs
	$(divs).each(function(){ if(~type.indexOf('show')) $(this).fadeIn(200); else $(this).fadeOut(200); }); 
}

function seqinfo(e){ //character info tooltip (on sequence click)
	if(!e.pageX||!e.pageY) return false;
	var x = e.pageX-dom.seq.offset().left-2;
	x = parseInt(x/model.boxw());
	var y = e.pageY-dom.seq.offset().top-2;
	y = parseInt(y/model.boxh());
	if(x<0){ x=0; } if(y<0){ y=0; }
	var col = model.visiblecols()[x]; var name = model.visiblerows()[y];
	if(!sequences[name]) return false;
	var suppl = col==x ? '' : '<br>(column '+(col+1)+' if uncollapsed)';
	var seqpos = sequences[name].slice(0,col+1).join('').replace(/[_\-.:]/g,'').length;
	var symb = typeof(sequences[name][col])=='undefined' ? '' : sequences[name][col];
	symb = canvaslabels[symb]||symb;
	var symbcanvas = typeof(symbols[symb])!='undefined'? cloneCanvas(symbols[symb]['refcanvas']) : '<span style="color:orange">'+symb+'</span>';
	if(leafnodes[name]) name = leafnodes[name].displayname||name;
	var content = $('<span style="color:orange">'+name+'</span><br>').add(symbcanvas).add('<span> row '+(y+1)+' position '+seqpos+' column '+(x+1)+suppl+'</span>');
	return {content:content, row:x, col:y, startx:x*model.boxw(), starty:y*model.boxh(), width:model.boxw(), height:model.boxh()}
}

function hidecolumns(e,id){ //make columns hidden (based on [selections =>]columnflags)
	if(e){ e.stopPropagation(); hidetooltip(); registerselections(id); }
	var undodata = [], range = [], col = 0;
	if(id && id=='noundo') undodata = false;
	for(var c=0,adj=0;c<colflags.length;c++){
		if(undodata){
			col = model.visiblecols()[c-adj];
			if(colflags[c]){ if(!range.length) range[0] = col; }
			else if(range.length){ range[1] = col; undodata.push(range); range = []; } 
		}
		if(colflags[c]){ model.visiblecols.splice(c-adj,1); adj++; } //remove columns from rendering list
	}
	if(undodata){
		if(range.length){ range[1] = col+1; undodata.push(range); }
		if(undodata.length){
			var s = undodata.length==1? ' was' : 's were';
			var undodesc = undodata.length+' alignment column range'+s+' collapsed.';
			model.addundo({name:'Collapse columns',type:'seq',data:undodata,info:undodesc,
			undoaction:'show columns',redoaction:'hide columns'});
		}
	}
	redraw();
}

function showcolumns(gaparr,hidetip){ //make columns visible again (based on input ranges)
	if(hidetip) hidetooltip();
	if(gaparr=='all'){ model.visiblecols.removeAll(); for(var c=0;c<model.alignlen();c++){model.visiblecols.push(c)}; redraw(); return; }
	var visiblecols = model.visiblecols();
	$.each(gaparr, function(i,gapcols){
		if(gapcols.length!=2) return true;
		var scol = gapcols[0], ecol = gapcols[1], start = 0, del = 0, fill = [];
		$.each(visiblecols,function(i,c){ if(c>=scol){ //indexes to fill in
				if(i&&!start) start = i;
				if(c<ecol) del++; else return false;
		}});
		for(var f=scol;f<ecol;f++){ fill.push(f); }
		if(scol>=visiblecols.length) start = visiblecols.length;
		model.visiblecols.splice.apply(model.visiblecols,[start,del].concat(fill));
	});
}

function hiderows(e,id){ //hide seq. rows from seq. area
	if(e){ e.stopPropagation(); hidetooltip(); }
	var namearr = [];
	action = 'hide';
	registerselections(id);
	for(var r=0;r<rowflags.length;r++){ if(rowflags[r]){ namearr.push(model.visiblerows()[r]); }}
	$.each(namearr,function(n,name){ if(leafnodes[name]) leafnodes[name].hideToggle('hide'); });
	refresh();
}

function maskdata(e,action,id){ //mask a sequence region
	if(e){ e.stopPropagation(); hidetooltip(); }
	var target = ~action.indexOf('rows')? 'rows' : ~action.indexOf('columns')? 'columns' : 'selections';
	if(~action.indexOf('unmask')){ var symboltype = 'unmasked'; var flag = false; } else { var symboltype = 'masked'; var flag = 1; }
	registerselections(id);
	var undodata = {}, undodesc = '';
	
	if(~action.indexOf('all')){
		for(var name in sequences){ for(var c=0;c<sequences[name].length;c++) sequences[name][c] = symbols[sequences[name][c]][symboltype]; }
	}
	else if(action=='hidemaskedcols'){
		for(var c=0;c<maskedcols.length;c++){ 
			if(maskedcols[c]){
				var colind = model.visiblecols.indexOf(c);
				if(~colind){ model.visiblecols.splice(colind,1); }
			} 
		}
	}
	else if(target=='columns'){
		undodata._columns = []; var firstrow = true;
		for(var name in sequences){ if(~model.visiblerows.indexOf(name)){
			if(flag) undodata[name] = 'columns';
			for(var c=0;c<colflags.length;c++){ if(colflags[c]){
					var colid = model.visiblecols()[c];
					sequences[name][colid] = symbols[sequences[name][colid]][symboltype];
					maskedcols[colid] = flag;
					if(flag && firstrow) undodata._columns.push(colid);
			}}
			firstrow = false;
		}}
		undodesc = undodata._columns.length+' alignment columns were masked.';
	}
	else if(target=='rows'){
		for(var r=0;r<rowflags.length;r++){ if(rowflags[r]){
				var name = model.visiblerows()[r];
				if(flag) undodata[name] = 'all';
				for(var c=0;c<sequences[name].length;c++){ sequences[name][c] = symbols[sequences[name][c]][symboltype]; }
		}}
		undodesc = Object.keys(undodata).length+' sequences were masked.';
	}
	else if(target=='selections'){
		for(var s=0;s<selections.length;s++){
			var sel = selections[s];
			for(var r=sel.rowstart;r<sel.rowend;r++){
				var name = model.visiblerows()[r];
				if(!undodata[name]) undodata[name] = [];
				for(var c=sel.colstart;c<=sel.colend;c++){
					var colid = model.visiblecols()[c];
					sequences[name][colid] = symbols[sequences[name][colid]][symboltype];
					if(flag) undodata[name].push(colid);
					else maskedcols[colid] = false;
				}
			}
		}
		undodesc = selections.length+' alignment blocks were masked.';
	}
	if(!$.isEmptyObject(undodata)){
		model.addundo({name:'Mask '+target,type:'seq',data:undodata,info:undodesc,undoaction:'unmask',redoaction:'mask'});
	}
	redraw();
}

function undoseq(undodata,action){ //undo/redo sequence actions
	if(~action.indexOf('mask')){ //(un)mask seq. areas/rows/columns
		var symboltype = ~action.indexOf('unmask')? 'unmasked' : 'masked';
		var columns = undodata._columns? undodata._columns : [];
		for(name in undodata){
			if(!sequences[name]) continue;
			if(undodata[name]==='all'){
				for(var c=0;c<sequences[name].length;c++) sequences[name][c] = symbols[sequences[name][c]][symboltype];
			} else {
				if(undodata[name]!=='columns') columns = undodata[name];
				for(var c=0;c<columns.length;c++) sequences[name][columns[c]] = symbols[sequences[name][columns[c]]][symboltype];
			}
		}
	}
	else if(~action.indexOf('columns')){ //(un)hide seq. columns
		if(~action.indexOf('show')) showcolumns(undodata);
		else if(~action.indexOf('hide')){
			colflags = [];
			var c = 0, i = 0; visiblecols = model.visiblecols();
			$.each(undodata,function(i,range){
				if(range.length!=2) return true;
				var scol = range[0], ecol = range[1];
				for(;i<visiblecols.length;i++){ //column range=>colflags
					c = visiblecols[i];
					if(c>=scol){ if(c<ecol) colflags[i] = 1; else break; }
				}
			});
			hidecolumns('','noundo');
		}
	}
	redraw();
}

/* Generate pop-up windows */
function makewindow(title,content,options,container){ //(string,array(,obj{flipside:'front'|'back',backfade,btn:string|jQObj|array,id:string},jQObj))
	if(!options) options = {};
	if(!$.isArray(content)) content = [content];
	var animate = settingsmodel.windowanim();
	if(options.id && $('#'+options.id).length!=0){ $('#'+options.id).remove(); }//kill clones
	if(options.flipside){ //we make two-sided window
		var sideclass = 'side '+options.flipside;
		if(!animate) sideclass += ' notransition';
	} else if(animate){ var sideclass = 'zoomin'; } else { var sideclass = ''; }
	var windowdiv = $('<div class="popupwindow '+sideclass+'"></div>');
	if(options.id) windowdiv.attr('id',options.id);
	var shade = $("#backfade");
	var closebtn = $('<img src="img/closebtn.png" class="closebtn" title="Close window">');
	var closefunc = function(){ //close window
		var wrapdiv = container ? container : windowdiv; 
		wrapdiv.removeClass('zoomed');
		if(animate) setTimeout(function(){ wrapdiv.remove() },600); else wrapdiv.remove();
		if(shade.css('display')!='none'){ shade.css('opacity',0); setTimeout(function(){ shade.hide() },600); }
		if(options.closefunc) options.closefunc();
	};
	closebtn.click(closefunc);
	if(options.btn){ //add buttons
		if(typeof(options.btn)=='string'||options.btn.jquery){ options.btn = [options.btn]; var align = 'center'; }//one btn
		else{ var align = 'right'; }//array of btns
		var btndiv = $('<div class="btndiv" style="text-align:'+align+'">');
		$.each(options.btn,function(b,btn){
			if(typeof(btn)=='string'){ btndiv.append($('<a class="button">'+btn+'</a>').click(closefunc)); }
			else { btndiv.append(btn) }
		});
		content.push(btndiv);
	}
	var titlediv = $('<div class="windowtitle"></div>');
	var contentdiv = $('<div class="windowcontent"></div>');
	contentdiv.css('max-height',$('#right').innerHeight()+'px');
	var headerdiv = $('<div class="windowheader"></div>');
	if(options.header){ $.each(options.header,function(i,val){ headerdiv.append(val) }); }
	if(options.icn){ if(options.icn.indexOf('.')==-1) options.icn+='.png'; title = '<img class="windowicn" src="img/'+options.icn+'"> '+title; }
	titlediv.html(title);
	$.each(content,function(i,val){ contentdiv.append(val) });
	windowdiv.append(headerdiv,contentdiv,titlediv,closebtn);
	
	var dragdiv = container||windowdiv;
	var toFront = function(windiv,first){ //bring window on top
		var maxz = Math.max.apply(null, $.map($('#page>div.popupwindow,div.popupwrap'), function(e,i){ return parseInt($(e).css('z-index'))||1; }));
		var curz = parseInt($(windiv).css('z-index'));
		if((curz<maxz) || (curz==maxz&&first)) $(windiv).css('z-index',maxz+1);
    }
	if($('#page>div.popupwindow').length){ //place a new window to shifted overlap
		toFront(dragdiv,'first');
		var pos = $('#page>div.popupwindow').last().position();
		dragdiv.css({'top':pos.top+20+'px','left':pos.left+20+'px'});
	}
	if(container) container.append(windowdiv); //add window to webpage
	else $("#page").append(windowdiv);
	
	dragdiv.mousedown(function(){ toFront(dragdiv) });
	if(container && windowdiv.width()>container.width()) container.css('width',windowdiv.width()+'px');
	if(container && windowdiv.height()>container.height()) container.css('height',windowdiv.height()+'px');
	setTimeout(function(){
	  	dragdiv.draggable({ //make window draggable by its title
			handle : "div.windowtitle",
			containment : [10,10,$("#page").width()-dragdiv.width()-20,$("#page").height()-dragdiv.height()-10]
	}); },600); //add lag to get window dimensions
    if(options.backfade){ //make stuff visible
    	shade.css('display','block');
    	setTimeout(function(){ shade.css('opacity',1) },50);
    	if(animate) setTimeout(function(){ dragdiv.addClass('zoomed') },300);
    }
    else if(animate){ setTimeout(function(){ dragdiv.addClass('zoomed') },50); }
    setTimeout(function(){ dragdiv.addClass('finished') },800); //avoid transition bugs
	return windowdiv;
}

//Content for different types of pop-up windows
function dialog(type,options){
	if($('#'+type).length){ $('#'+type).trigger('mousedown');  return; } //window laready created. bring it to front.
	var helpimg = $('<img class="icn" src="img/help.png">');
	if(type=='import'){
		$('div.popupwindow').remove(); //close other windows
		var fileroute = window.File && window.FileReader && window.FileList ? 'localread' : 'upload';
		
		var localhelp = 'Select file(s) that contain aligned or unaligned sequence (and tree) data. Supported filetypes: fasta, newick (.tree), HSAML (.xml), NEXUS, phylip, ClustalW (.aln), phyloXML';
		var localheader = '<div class="sectiontitle"><img src="img/hdd.png"><span>Import local files</span><span class="svg" title="'+localhelp+'">'+svgicon('info')+'</span></div><br>';
		var filedrag = $('<div class="filedrag">Drag files here</div>');
		filedrag.bind('dragover',function(evt){ //file drag area
			filedrag.addClass('dragover');
			evt.stopPropagation();
    		evt.preventDefault();
    		evt.originalEvent.dataTransfer.dropEffect = 'copy';
    	}).bind('dragleave',function(evt){
			filedrag.removeClass('dragover');
			evt.stopPropagation();
    		evt.preventDefault();
    	}).bind('drop',function(evt){
    		evt.stopPropagation();
    		evt.preventDefault();
    		filedrag.removeClass('dragover');
    		checkfiles(evt.originalEvent.dataTransfer.files,fileroute);
    	});
		var fileinput = $('<input type="file" multiple style="opacity:0" name="upfile">');
		var form = $('<form enctype="multipart/form-data" style="position:absolute">');
		form.append(fileinput);
		filedrag.append(form);
		fileinput.change(function(){ checkfiles(this.files,fileroute) });
		var selectbtn = $('<a class="button" style="vertical-align:0">Select files</a>');
		selectbtn.click(function(e){ fileinput.click(); e.preventDefault(); });
		var or = $('<div style="display:inline-block;font-size:18px;"> or </div>');
		
		var remoteheader = '<br><br><div class="sectiontitle"><img src="img/web.png"><span>Import remote files</span></div><br>';
		var urladd = $('<a title="Add another URL" class="button urladd">+</a>'); //url inputs+buttons
		var urlinput = $('<input type="url" class="url" placeholder="Type a file web address" pattern="https?://.+">');
		urlinput.focus(function(){ urlinput.next("span.icon").empty() });
		urladd.click(function(){
			var rmvbtn = $('<a title="Remove URL" class="button urladd" style="padding:2px 2px 6px">-</a>');
			rmvbtn.click(function(){
				var curbtn = $(this);
				var rmvarr = [curbtn.prev("br"),curbtn,curbtn.next("input"),curbtn.next("input").next("span.icon")];
				$.each(rmvarr,function(i,el){ el.remove() });
			});
			var urlinput =  $("input.url").last();
			urlinput.after("<br>",rmvbtn,urlinput.clone().val(''),'<span class="icon"></span>');
		});
		var dwnlbtn = $('<a class="button">Download files</a>');
		dwnlbtn.click(function(){
			var urlarr = [];
			$("#import .front .windowcontent input.url").each(function(i,input){
				var val = $(input).val();
				var filename = val.substr(val.lastIndexOf('/')+1);
				urlarr.push({ name:filename, url:val });
			});
			checkfiles(urlarr,'download'); 
		});
		
		var ensheader = '<br><br><div class="sectiontitle"><img src="img/ensembl.png"><span>Import from <a href="http://www.ensembl.org" target="_blank">Ensembl</a></span>'+
		'<span class="svg" title="Retrieve a set of homologous sequences corresponding to Ensembl Gene or GeneTree ID">'+svgicon('info')+'</span></div><br>';
		var enscontent = '<div style="padding:0 10px"><select data-bind="options:idformats, optionsText:\'name\', value:idformat"></select>'+
		' <input style="width:210px" type="text" data-bind="attr:{placeholder:idformat().example},value:ensid"><br>'+
		'<div data-bind="slidevisible:idformat().name==\'Gene\'">Find Ensembl Gene ID:<br>'+
		'species <input type="text" data-bind="value:idspecies"/> gene name <input type="text" data-bind="value:idname" style="width:80px"/> '+
		'<a id="ensidbtn" class="button square"  style="margin:0" onclick="ensemblid()">Search</a></div><span style="color:#888">Options:</span><br>'+
		'<ul><li>Import <span data-bind="visible:idformat().name==\'Gene\'">unaligned</span>'+
		'<select data-bind="visible:idformat().name!=\'Gene\',value:aligned"><option value="true">aligned</option><option value="">unaligned</option></select>'+
		' <select data-bind="value:seqtype"><option value="cdna">cDNA</option><option value="protein">protein</option></select> sequences</li>'+
		'<li data-bind="slidevisible:idformat().name==\'Gene\'">Include <select data-bind="value:homtype" style="margin-top:5px"><option value="all">all homologous</option>'+
		'<option value="orthologues">orthologous</option><option value="paralogues">paralogous</option></select> genes</li>'+
		'<li data-bind="slidevisible:idformat().name==\'Gene\'">Restrict to a target species <input type="text" data-bind="value:target" style="width:100px"/></li></ul></div>'+
		'<a id="ensbtn" class="button" onclick="ensemblimport()">Import</a> <span id="enserror" class="note" style="color:red"></span>';
		
		var animclass = settingsmodel.windowanim()? 'zoomin' : '';
		var dialogwrap = $('<div id="import" class="popupwrap '+animclass+'"></div>');
		$("#page").append(dialogwrap);
		var dialogwindow = makewindow("Import data",[localheader,filedrag,or,selectbtn,ensheader,enscontent,remoteheader,urladd,urlinput,'<span class="icon"></span><br>',dwnlbtn],{backfade:true,flipside:'front',icn:'import.png'},dialogwrap);
		ko.applyBindings(ensemblmodel,dialogwindow[0]);
		var flipdialog = makewindow("Import data",[],{backfade:false,flipside:'back',icn:'import.png'},dialogwrap);
	} //import dialog
	else if(type=='export'){
		exportmodel.filename(exportmodel.savename().replace(' ','_'));
		var flipexport = function(){
			$("#exportwrap").removeClass('finished flipped');
			setTimeout(function(){ $("#exportwrap").addClass('finished') },900); //avoid firefox transition bugs
		};
		if($("#exportwrap").length){ //use existing window
			$("#exportwrap").click();
			flipexport();
			if(options) parseexport('',options);
			return;
		}
		var animclass = settingsmodel.windowanim()? 'zoomin' : '';
		var exportwrap = $('<div id="exportwrap" class="popupwrap '+animclass+'">');
		$("#page").append(exportwrap);
		var hasancestral = false;
		$.each(leafnodes,function(name,node){ if(node.type=='ancestral'){ hasancestral = true; return false; }});
		var frontcontent = $('<div class="sectiontitle" style="min-width:320px"><img src="img/file.png"><span>File</span></div>'+
		'<span class="cell">Data<hr><select data-bind="options:categories, optionsText:\'name\', value:category"></select></span>'+
		'<span class="cell" data-bind="fadevisible:category().formats.length,with:category">Format<hr><span data-bind="visible:formats.length==1,text:formats[0].name"></span><select data-bind="visible:formats.length>1, options:formats, optionsText:\'name\', value:$parent.format"></select></span>'+
		'<span class="cell" data-bind="with:format,fadevisible:format().variants.length>1">Variant<hr><select data-bind="options:variants, optionsText:\'name\', value:$parent.variant"></select></span> '+
		'<span class="svgicon" style="margin-left:-8px" data-bind="fadevisible:variant().desc,attr:{title:variant().desc,onclick:infolink()}">'+svgicon('info')+'</span><br>'+
		'&nbsp;Name: <input type="text" class="faded" style="width:200px;text-align:right;margin:0" title="Click to edit" data-bind="value:filename"><span style="font-size:17px" data-bind="visible:variant().ext.length<2,text:variant().ext[0]"></span><select data-bind="visible:variant().ext.length>1, options:variant().ext, value:fileext"></select><br>'+
		'<br><div class="sectiontitle"><img src="img/gear2.png"><span>Options</span></div>'+
		(hasancestral?'<input type="checkbox" data-bind="checked:inclancestral"> Include ancestral node sequences':'')+
		//'  <input type="checkbox" data-bind="visible:curitem().interlace,checked:interlaced"><span class="label" title="Interlace sequence data rows" data-bind="visible:curitem().interlace">Interlaced</span>'+
		'<div data-bind="slidevisible:category().name.indexOf(\'Seq\')!=-1">&nbsp;Mark masked sequence with <select data-bind="options:maskoptions,value:masksymbol"></select><br>'+
		'<input type="checkbox" data-bind="checked:inclhidden">Include hidden columns</div></div>');
		var makebtn = $('<a class="button" data-bind="visibility:format">Make file</a>');
		makebtn.click(function(){ parseexport(); });
		var frontwindow = makewindow("Export data",frontcontent,{icn:'export.png',id:'exportwindow',flipside:'front',btn:makebtn},exportwrap);
		var backcontent = $('<div class="sectiontitle"><img src="img/file.png"><span data-bind="text:filename()+(~filename().indexOf(\'.\')?\'\':fileext())"></span></div>'+
		'<div class="insidediv" style="max-width:400px;max-height:150px;overflow:auto"><div class="paper"></div></div>');
		var backbtn = $('<a class="button" style="padding-left:17px;margin-top:25px"><span style="vertical-align:2px">&#x25C0;</span> Setup</a>');
		backbtn.click(function(){ flipexport(); exportmodel.filename(exportmodel.savename().replace(' ','_')); });
		var downloadbtn = $('<a class="button" style="margin-left:40px;margin-top:25px" data-bind="visible:fileurl,attr:{href:fileurl()+\'?download\'}">Download</a>');
		var backwindow = makewindow("Export data",[backcontent,backbtn,downloadbtn],{icn:'export.png', id:'exportedwindow', flipside:'back'},exportwrap);
		ko.applyBindings(exportmodel,exportwrap[0]);
		if(options) parseexport('',options);
	}
	else if(type=='save'){
		var content = 'Save current data as <span data-bind="visible:!model.currentid(),text:savetarget().name"></span><select data-bind="visible:model.currentid(), options:savetargets, optionsText:\'name\', value:savetarget"></select> analysis in the library.<br><br>'+
		'<span data-bind="fadevisible:savetarget().type!=\'overwrite\'">Name: <input type="text" class="hidden" title="Click to edit" data-bind="value:savename"></span>';
		var savebtn = $('<a class="button" onclick="savefile(this)">Save</a>');
		var savewindow = makewindow("Save to libray",[content],{icn:'save.png', id:type, btn:savebtn});
		ko.applyBindings(exportmodel,savewindow[0]);
	}
	else if(type=='info'){
		var list = '<ul>'+
		'<li data-bind="visible:treesource">Number of tree nodes: <span data-bind="text:nodecount"></span></li>'+
		'<li data-bind="visible:treesource">Number of tree leafs: <span data-bind="text:leafcount"></span></li>'+
		'<li>Number of sequences: <span data-bind="text:seqcount"></span>, in total of <span data-bind="text:totalseqlength"></span></li>'+
		'<li>Sequence length: <span data-bind="text:minseqlength"></span> to <span data-bind="text:maxseqlength"></span></li>'+
		'<li>Sequence matrix length: <span data-bind="text:alignlength"></span> columns '+
		'<span data-bind="visible:hiddenlen,text:\'(\'+hiddenlen()+\' columns hidden)\'"></span></li>'+
		'<li>Sequence matrix height: <span data-bind="text:alignheight"></span> rows</li>'+
		'<li data-bind="visible:sourcetype">Data source: <span data-bind="text:sourcetype"></span></li>'+
		'<li data-bind="visible:treesource()&&!ensinfo().type">Tree file: <span data-bind="text:treesource"></span></li>'+
		'<li data-bind="visible:seqsource()&&!ensinfo().type">Sequence file: <span data-bind="text:seqsource"></span></li>'+
		'</ul>';
		var enslist = '<div data-bind="if:ensinfo().type" style="margin-top:5px"><span style="color:#666">About Ensembl dataset:</span><br>'+
		'<ul data-bind="with:ensinfo"><!-- ko if: type==\'homology\' -->'+
		'<li>Homologs to <span data-bind="text:species"></span> gene '+
		'<a data-bind="attr:{href:\'http://www.ensembl.org/\'+species.replace(\' \',\'_\')+\'/Gene/Summary?g=\'+id,target:\'_blank\',title:\'View in Ensembl\'},text:id"></a></li>'+
		'<!-- /ko --><!-- ko if: type==\'genetree\' -->'+
		'<li>Genetree <a data-bind="attr:{href:\'http://www.ensembl.org/Multi/GeneTree?gt=\'+id,target:\'_blank\',title:\'View in Ensembl\'},text:id"></a></li>'+
		'<!-- /ko --></ul></div>';
		var dialogwindow = makewindow("Data information",[list,enslist],{btn:'OK',icn:'info.png',id:type});
		ko.applyBindings(model,dialogwindow[0]);
	}
	else if(type=='align'){
		var rotatearr = $('<span class="rotateable">&#x25BA;</span>');
		var opttitlespan = $('<span class="actiontxt" title="Click to toggle options">Alignment options</span>');
		opttitlespan.click(function(){
			var expdiv = $(this).parent().next(".insidediv");
			if(expdiv.css('display')=='none'){ rotatearr.addClass('rotateddown'); expdiv.slideDown(); infospan.fadeIn(); }
			else{ rotatearr.removeClass('rotateddown'); expdiv.slideUp(); infospan.fadeOut(); }
		});
		var infospan = $('<span class="note" style="display:none;margin-left:20px">Hover options for description</span>');
		var nameinput = $('<input type="text" class="hidden" value="Prank alignment" title="Click to edit">');
		var namespan = $('<span class="note">Descriptive name: </span>').append(nameinput);
		var opttitle = $('<div>').append(rotatearr,opttitlespan,infospan);
		var optdiv = $('<div class="insidediv" style="display:none">');
		var treecheck = $.isEmptyObject(treesvg)?'checked="" disabled=""':''; //new tree needed
		var parentoption = model.parentid()?'<option value="sibling" checked="checked">branch parent</option>':'';
		var writetarget = model.currentid()?'Aligned data will <select name="writemode">'+parentoption+
		'<option value="child" '+(model.parentid()?'':'checked="checked"')+'>branch current</option>'+
		'<option value="overwrite">overwrite current</option></select> analysis files in the <a onclick="dialog(\'library\'); return false">library</a>.<br><br>':'';
		var optform = $('<form id="alignoptform" onsubmit="return false">'+writetarget+
		'<input type="checkbox" name="newtree" '+treecheck+'><span class="label" title="Checking this option builds a new guidetree for the sequence alignment process (otherwise uses the current tree).">make new tree</span>'+
		'<br><input type="checkbox" checked="checked" name="anchor"><span class="label" title="Use Exonerate anchoring to speed up alignment">alignment anchoring</span> '+
		'<br><input type="checkbox" name="e"><span class="label" title="Checking this option keeps current alignment intact (pre-aligned sequences) and only adds sequences for ancestral nodes.">keep current alignment</span>'+
		'<br><br><div class="sectiontitle"><span>Model parameters</span></div>'+
		'<input type="checkbox" checked="checked" name="F"><span class="label" title="Enabling this option is generally beneficial but may cause an excess of gaps if the guide tree is incorrect">trust insertions (+F)</span>'+
		'<br><span class="label" title="Gap opening rate">gap rate</span> <input type="text" name="gaprate" style="width:50px" data-bind="value:gaprate">'+
		' <span class="label" title="Gap length">gap length</span> <input type="text" name="gapext" data-bind="value:gapext" style="width:40px">'+
		' <span class="label" title="Κ defines the ts/tv rate ratio for the HKY model that is used to compute the substitution scores for DNA alignments" data-bind="visible:isdna">K</span> <input type="text" name="kappa" data-bind="visible:isdna">'+
		'<br><span class="label" title="Default values are empirical, based on the input data." data-bind="visible:isdna">DNA base frequencies</span> <input type="text" name="A" placeholder="A" data-bind="visible:isdna"><input type="text" name="C" placeholder="C" data-bind="visible:isdna"><input type="text" name="G" placeholder="G" data-bind="visible:isdna"><input type="text" name="T" placeholder="T" data-bind="visible:isdna"><input type="hidden" name="dots" value="true"></form>');
		optdiv.append(optform);
		var alignbtn = $('<a class="button">Start alignment</a>');
		alignbtn.click(function(){ sendjob({form:optform[0],btn:alignbtn,statusdiv:{div:optdiv,title:opttitle},name:nameinput.val()}); });
		var dialogwindow = makewindow("Make alignment",['Current sequence data will be aligned with <a href="http://www.ebi.ac.uk/goldman-srv/prank" target="_blank">Prank</a> aligner.<br><hr>',namespan,opttitle,optdiv,'<br>'],{id:type,btn:alignbtn});
		ko.applyBindings(model,dialogwindow[0]);
	}
	else if(type=='jobstatus'){
		communicate('alignstatus','','jobdata'); //refresh data
		
		var treenotif = $('<div data-bind="visible:treealtered" class="sectiontext">The tree phylogeny has been changed and the sequence alignment needs to be updated to reflect the new tree. Please realign the sequences'+
		'<span data-bind="visible:treesnapshot"> or revert the tree modifications</span>.<br>'+
		'<a class="button square red" data-bind="visible:treesnapshot" onclick="model.selectundo(\'firsttree\'); model.undo(); return false;">Revert</a></div>');
		var realignbtn = $('<a class="button square">Realign</a>');
		var optform = model.currentid()? $('<form id="realignoptform" onsubmit="return false">The realignment will <select name="writemode">'+
		(model.parentid()?'<option value="sibling" checked="checked">branch parent</option>':'')+
		'<option value="child" '+(model.parentid()?'':'checked="checked"')+'>branch current</option>'+
		'<option value="overwrite">overwrite current</option></select> analysis files in the <a onclick="dialog(\'library\'); return false;">library</a>.</form>') : [''];
		realignbtn.click(function(){ sendjob({form:optform[0],btn:realignbtn,name:'Realignment',realign:true}) });
		treenotif.append(realignbtn,optform);
		
		var updatenotif = $('<div data-bind="visible:update" class="sectiontext"><hr data-bind="visible:treealtered"/>'+
		'There is an update available for Wasabi. Update notes:<div class="insidediv">Prank updated to ver. '+model.version.remote()+
		'<br><ul><li>'+model.version.lastchange.replace(/- /g,'</li><li>')+'</li></ul></div>'+
		'<a class="button square red" onclick="settingsmodel.skipversion(model.version.remote());settingsmodel.saveprefs();return false;">Dismiss</a></div>');
		var updatebtn = $('<a class="button square">Update</a>');
		updatenotif.append(updatebtn);
		
		var notifdiv = $('<div class="sectiontitle" data-bind="visible:notifications"><img src="img/info.png"><span>Notifications</span></div>').after(treenotif,updatenotif);
		
		var jobslistdiv = '<div class="sectiontitle" data-bind="visible:serverdata.jobdata().length"><img src="img/run.png"><span>Status of background tasks</span></div><div class="insidediv" data-bind="visible:serverdata.jobdata().length,foreach:{data:serverdata.jobdata,afterAdd:additem}"><div class="itemdiv" data-bind="html:html"></div><div class="insidediv logdiv"></div><hr></div>';
		var statuswindowdiv = makewindow("Status overview",[notifdiv,jobslistdiv],{id:type,icn:'status'});
		ko.applyBindings(model,statuswindowdiv[0]);
	}
	else if(type=='library'){
		communicate('getmeta','','analysdata');
		var content = $('<div class="insidediv" data-bind="foreach:{data:sortedanalys,afterAdd:additem,beforeRemove:removeitem}"><div class="itemdiv" data-bind="html:html,style:{height:divh},css:{activeitem:isactive}"></div><div class="insidediv logdiv"></div><hr></div>');
		var header = ['<span class="dirtrail" data-bind="html:libdir"></span>','<span style="position:absolute;top:6px;right:15px;"><span class="fade" style="left:-35px"></span>Sort by: <select data-bind="options:sortanalysopt,optionsText:\'t\',optionsValue:\'v\',value:sortanalysby"></select></span>'];
		var librarywindow = makewindow("Library of analyses",content,{id:type,header:header,icn:'library.png'});
		ko.applyBindings(model,librarywindow[0]);
	}
	else if(type=='removeitem'||type=='terminate'){
		var btn = options.btn;
		var jobbtn = btn.title.indexOf('job')==-1 ? false : true;
		var afterfunc = jobbtn ? function(){ communicate('alignstatus','','jobdata'); } : function(){ communicate('getmeta',{parentid:parentid(options.id)},'analysdata'); };
		var action = type=='terminate' ? 'terminate' : 'rmdir';
		var startlabel = type=='terminate'? 'Kill' : 'Delete';
		if(btn.innerHTML==startlabel){
			btn.innerHTML = 'Confirm';
			setTimeout(function(){ btn.innerHTML=startlabel; },4000);
		}else{
			communicate(action,{id:options.id},{btn:btn,func:afterfunc});
			if(action=='rmdir' && options.id==model.currentid()){ model.currentid(''); model.unsaved(true); }
		}
	}
	else if(type=='error'||type=='warning'){
		if(typeof(options)!='Array') options = [options];
		makewindow(type,options,{btn:'Dismiss',icn:'warning'});
	}
	else if(type=='seqtool'){
		var content = $('<div class="sectiontitle"><span>Filter alignment columns</span></div><div class="sectiontext">'+
		'Hide all sequence alignment columns where: <ul><li>less than <input id="hidecolinp" type="text" class="digit" data-bind="value:hidelimit,valueUpdate:\'afterkeydown\'"> '+
		'<span class="note" style="min-width:85px;text-align:center" data-bind="text:\'(or <\'+hidelimitperc()+\'% of)\'"></span> rows contain sequence data.<br>'+
		'<span class="note">0%</span><span class="draggerline"></span><span class="note">100%</span></li>'+
		'<li>gaps <span data-bind="visible:model.hasdot">represent <select data-bind="options:[\'indels\',\'insertions\',\'deletions\'],value:gaptype"></select></span>'+
		'<span data-bind="visible:!model.hasdot()">are</span> longer than <input type="text" class="digit" data-bind="value:gaplen,valueUpdate:\'afterkeydown\'"> columns.</li>'+
		'<li>keep <input type="text" class="digit" data-bind="value:buflen,valueUpdate:\'afterkeydown\'"> columns from each gap edge visible.</li></ul>'+
		'</div><div>This will collapse <span data-bind="text:hidecolcount"></span> columns '+
		'<span class="note" data-bind="text:\'(\'+hidecolperc()+\'%)\'"></span> of sequence alignment.</div>');
		var slider = $('<span class="dragger" data-bind="style:{left:sliderpos}"></span>');
		var sliderline = $('.draggerline',content);
		sliderline.append(slider);
		var applybtn = $('<a class="button">Apply</a>');
		applybtn.click(function(){ $("#seqtool img.closebtn").click(); setTimeout(function(){ hidecolumns(); },500); });
		var dialogwindow = makewindow('Sequence tools',content,{id:type,icn:'seq',btn:['Cancel',applybtn],closefunc:function(){clearselection()}});
		var dragw = sliderline.width(), rowcount = model.visiblerows().length;
		slider.draggable({ //make names width resizable
			axis: "x", 
			containment: 'parent',
			drag: function(e,elem) {
				toolsmodel.hidelimit(parseInt(((elem.position.left-sliderline.position().left+8)/dragw)*rowcount));
			}
		});
		toolsmodel.countgaps();
		ko.applyBindings(toolsmodel,dialogwindow[0]);
	}
	else if(type=='treetool'){
		var title = $('<div class="sectiontitle"><span>Prune tree leafs</span></div>');
		var content = $('<div class="sectiontext">You can mark/unmark tree leafs by clicking on a leaf name<br>or by dragging in the sequence area.<br><br></div>');
		
		var emptyleaves = [];
		$.each(leafnodes,function(name,node){ if(!sequences[name]) emptyleaves.push(name); });
   	  	if(emptyleaves.length){
   	  		var markbtn = $('<a class="button square small">Mark empty leafs</a>');
   	  		markbtn.click(function(){
   	  			$.each(leafnodes,function(name,node){ 
   	  				if(!sequences[name]) node.highlight(true); else node.highlight(false);
   	  		});});
   	  		var s = emptyleaves.length>1? ['s','ve'] : ['','s'];
   	  		content.append(emptyleaves.length+' leaf'+s[0]+' ha'+s[1]+' no sequence data.',markbtn,'<br><br>');
   	  	}
   	  	
		content.append('Then click "Apply" to <select data-bind="options:[\'hide\',\'prune\'],value:leafaction"></select> '+
		'<select data-bind="options:[\'marked\',\'unmarked\'],value:leafsel"></select> tree leafs.<br>'+
		'<span id="treetoolerror" style="color:red"></span>');
		var applybtn = $('<a class="button">Apply</a>');
		applybtn.click(toolsmodel.processLeafs);
		var closefunc = function(){ clearselection(); toolsmodel.markLeafs('unmark'); toolsmodel.prunemode = false; };
		var dialogwindow = makewindow('Tree tools',[title,content],{id:type,icn:'tree',btn:['Cancel',applybtn],closefunc:closefunc});
		clearselection(); toolsmodel.markLeafs('unmark'); toolsmodel.prunemode = true;
		if(model.selmode()!='rows') model.selmode('rows');
		ko.applyBindings(toolsmodel,dialogwindow[0]);
	}
	else if(type=='settings'){
		var content = $('<div class="insidediv" style="margin:0;padding:5px;"><div class="row btnrow" data-bind="visible:!model.offline()">Autosave after every <select data-bind="options:autosaveopt,value:autosaveint"></select> '+
		'<a class="button square" style="margin-top:-5px" data-bind="css:{on:autosave},click:toggle.bind($data,autosave)"><span class="light"></span><span class="text" data-bind="text:btntxt(autosave)"></span></a>'+
		'<br><span class="note" data-bind="visible:autosave">Sessions are saved to Library.</span></div>'+
		'<div class="row">Keep up to <select data-bind="options:[1,5,15,30],value:undolength"></select> actions in undo list.</div>'+
		'<div class="row bottombtn">Open <select style="margin-bottom:10px" data-bind="options:launchopt,value:onlaunch"></select> when launching Wasabi.<br>'+
		'Remember zoom level on launch. <a class="button square" data-bind="css:{on:keepzoom},click:toggle.bind($data,keepzoom)"><span class="light"></span><span class="text" data-bind="text:btntxt(keepzoom)"></span></a><br>'+
		'<div style="margin-top:13px" data-bind="visible:!model.offline()">Check for updates on launch. <a class="button square" data-bind="css:{on:update},click:toggle.bind($data,update)"><span class="light"></span><span class="text" data-bind="text:btntxt(update)"></span></a></div></div>'+
		'<div class="row" data-bind="visible:model.seqsource()">Display the sequences as <span class="buttongroup">'+
		'<a class="button left disabled" onclick="translate(\'dna\')" data-bind="css:{pressed:model.seqtype()==\'dna\'||model.seqtype()==\'rna\',disabled:model.nodnasource}">nucleot.</a>'+
		'<a class="button middle" onclick="translate(\'codons\')" data-bind="css:{pressed:model.seqtype()==\'codons\',disabled:model.nodnasource}">codons</a>'+
		'<a class="button right pressed" onclick="translate(\'protein\')" data-bind="css:{pressed:model.seqtype()==\'protein\'}">protein</a></span>'+
		'<div style="margin-top:10px">Colour sequences with <select data-bind="options:coloropt,value:colorscheme"></select> colour scheme.<br>'+
		'<span class="note" data-bind="text:colordesc[colorscheme()]"></span></div></div>'+
		'<div class="row btnrow bottombtn">User interface animations. '+
		'<a class="button square" data-bind="css:{on:allanim},click:toggle.bind($data,allanim)"><span class="light"></span><span class="text" data-bind="text:btntxt(allanim)"></span></a>'+
		'<div style="padding-left:10px;margin-top:3px">Dialog window animations. <a class="button square" style="margin-top:7px;" data-bind="css:{on:windowanim},click:toggle.bind($data,windowanim)"><span class="light"></span><span class="text" data-bind="text:btntxt(windowanim)"></span></a><br>'+
		'<span class="note">Disable window animations in case of blurry text.</span></div></div>'+
		'<div class="row btnrow bottombtn">Auto-hide menubar in minimized mode.<br><span class="note">Click on menubar bottom-left edge to toggle mode.</span>'+
		'<a class="button square" style="margin-top:-10px" data-bind="css:{on:hidebar},click:toggle.bind($data,hidebar)"><span class="light"></span><span class="text" data-bind="text:btntxt(hidebar)"></span></a></div></div>');
		var dialogwindow = makewindow('Preferences',content,{id:type, icn:type, btn:'OK', closefunc:settingsmodel.saveprefs});
		ko.applyBindings(settingsmodel,dialogwindow[0]);
	}
	else if(type=="about"){
		var content = $('<div class="sectiontitle"><span>About Wasabi</span></div><div class="sectiontext">'+
		'Wasabi is a browser-based application for the visualisation and analysis of multiple alignment molecular sequence data.<br>'+
		'Its multi-platform user interface is built on most recent HTML5 and Javascript standards and it is recommended to use the latest version of '+
		'<a href="http://www.mozilla.org/firefox" target="_blank">Firefox</a>, <a href="http://www.apple.com/safari" target="_blank">Safari</a> '+
		'or <a href="http://www.google.com/chrome" target="_blank">Chrome</a> web browser to run Wasabi.</div>'+
		'<div class="sectiontitle"><span>Support</span></div><div class="sectiontext">'+
		'<a class="logo" href="http://www.biocenter.fi" target="_blank"><img src="img/logo_bf.png"></a>'+
		'<a class="logo" href="http://www.biocenter.helsinki.fi/bi" target="_blank"><img src="img/logo_uh.png"></a>'+
		'<a class="logo" href="http://ec.europa.eu/research/mariecurieactions" target="_blank"><img src="img/logo_mc.jpg"></a><br>'+
		'<a class="logo" href="http://www.helsinki.fi/biocentrum" target="_blank"><img style="height:40px" src="img/logo_bch.gif"></a><br><br>'+
		'<div class="sectiontitle"><span>Contact</span></div><div class="sectiontext">'+
		'Wasabi is being developed by Andres Veidenberg from the <a href="http://blogs.helsinki.fi/sa-at-bi" target="_blank">Löytynoja lab</a> in Institute of Biotechnology, University of Helsinki.<br>'+
		'You can reach us via email <a href="mailto:andres.veidenberg@helsinki.fi" target="_blank">andres.veidenberg@helsinki.fi</a> or <a href="mailto:ari.loytynoja@helsinki.fi" target="_blank">ari.loytynoja@helsinki.fi</a>.</div>');
		var dialogwindow = makewindow('About',content,{id:type, icn:'info', btn:'OK'});
	}
	return false;
}

//submit an alignment job
function sendjob(options){
	var alignbtn = options.btn, optdiv=false, opttitle='';
	if(options.statusdiv){ optdiv = options.statusdiv.div; opttitle = options.statusdiv.title; }
	alignbtn.unbind('click'); //prevent multiple clicks
	
	var optdata = {btn:alignbtn[0]};
	if(options.form) optdata.form = options.form;
	var senddata = {};
	senddata.name = options.name||'sequence alignment';
	var parsedata = parseexport('fasta',{makeids:true}).split('|'); //[fastafile,name>id hash]
	senddata.fasta = parsedata[0];
	var nameids = JSON.parse(parsedata[1]);
	var idnames = {};
	$.each(nameids, function(name,id){ idnames[id] = name; });
	senddata.idnames = idnames;
	if(options.realign || (!$.isEmptyObject(treesvg) && !options.form['newtree']['checked'])) senddata.newick = parseexport('newick',{tags:true,nameids:nameids});
	if(options.realign) senddata.realign = 'true';
	if(model.currentid()) senddata.id = model.currentid();
	if(model.parentid()) senddata.parentid = model.parentid();
	var nodeinfo = {};
	$.each(leafnodes,function(name,node){ if(node.ensinfo&&node.type!='ancestral') nodeinfo[name] = node.ensinfo; });
	if(!$.isEmptyObject(nodeinfo)) senddata.nodeinfo = nodeinfo;
	if(!$.isEmptyObject(model.ensinfo())) senddata.ensinfo = model.ensinfo();
	if(model.hiddenlen()) senddata.visiblecols = model.visiblecols();
	
	optdata.success = function(data){ //job sent to server. Show status.
		alignbtn.html('Done');
		communicate('alignstatus','','jobdata');
		setTimeout(function(){
			if(options.realign) model.treealtered(false);
			if(optdiv) alignbtn.closest("div.popupwindow").find("img.closebtn").click(); //close alignment setup winow
		}, 600);
	}
	var ajaxobj = communicate('startalign',senddata,optdata);
	setTimeout(function(){
		if(ajaxobj.readyState<4){ //close hanging request
			communicate('alignstatus','','jobdata');
			if(optdiv) alignbtn.closest("div.popupwindow").find("img.closebtn").click();
			ajaxobj.abort();
	}},2000);
	return false; //for onclick
}

//import ensembl data
function ensemblimport(){
	filescontent = {};
	var idformat = ensemblmodel.idformat().url;
	var ensid = ensemblmodel.ensid() || ensemblmodel.idformat().example;
	var ensbtn = document.getElementById('ensbtn');
	var urlopt = idformat=='genetree'? '?content-type=text/x-phyloxml+xml' : '?content-type=application/json';
	if(idformat=='homology'){
		urlopt += ';type='+ensemblmodel.homtype();
		if(ensemblmodel.target()) urlopt += ';target_species='+ensemblmodel.target();
	}
	else if(ensemblmodel.aligned()) urlopt += ';aligned=True';
	urlopt += ';sequence='+ensemblmodel.seqtype();
	var urlstring = ('http://beta.rest.ensembl.org/'+idformat+'/id/'+ensid+urlopt).replace(/ /g,'+');
	var processdata = function(ensdata){
		var senderror = function(){ //display error message next to the button
			ensbtn.innerHTML = 'Error';
			$('#enserror').text(ensdata.error||'Unknown error. Try again.'); $('#enserror').fadeIn();
			setTimeout(function(){ ensbtn.innerHTML = 'Import'; $('#enserror').fadeOut(); },4000);
			return false;
		}
		
		try{ ensdata = JSON.parse(ensdata); } catch(e){ if(~ensdata.indexOf('BaseHTTP')) ensdata = {error:'No response. Check network connectivity.'}; }
		if(typeof(ensdata)=='object'){ //JSON => server error or gene homology data
			if(!ensdata.data){
				if(!ensdata.error) ensdata = {error:'Data is in unexpected format. Try other options.'};
		  		return senderror();
			}
			else filescontent[ensid+'.json'] = ensdata;
		} else { //XHTML => genetree data
			if(ensdata.indexOf('phyloxml')==-1){
				ensdata = {error:'Data is in unexpected format. Try other options.'};
				return senderror();
			}
			var xmlstr = ensdata.substring(ensdata.indexOf('<pre>'),ensdata.indexOf('</pre>')+6);
			xmlstr = $(xmlstr).text().replace(/\s*\n\s*/g,'');
			filescontent[ensid+'.xml'] = xmlstr;
		}
		setTimeout(function(){ parseimport({source:'Ensembl',importbtn:$(ensbtn),ensinfo:{type:idformat,id:ensid}}) },100);
	}
	//reqest data, then process it
	communicate('geturl',{fileurl:urlstring},{success:processdata,btn:ensbtn,retry:true});
	return false; //for onclick
}

//search for ensembl gene id
function ensemblid(ensdata){
	var ensbtn = document.getElementById('ensidbtn');
	if(!ensdata){ //send request
		if(!ensemblmodel.idspecies()||!ensemblmodel.idname()) return;
		var urlstring = ('http://beta.rest.ensembl.org/xrefs/symbol/'+ensemblmodel.idspecies()+'/'+ensemblmodel.idname()+'?content-type=application/json;object=gene').replace(/ /g,'+');
		communicate('geturl',{fileurl:urlstring},{success:function(data){ensemblid(data)},btn:ensbtn,retry:true,restore:true});
		return false;
	}
	//process data
	try{ ensdata = JSON.parse(ensdata); } catch(e){
		if(~ensdata.indexOf('BaseHTTP')) ensdata = {error:'No response. Check network connectivity.'};
		else ensdata = {error:'No match. Try different search.'};
	}
	if($.isArray(ensdata) && !ensdata.length) ensdata = {error:'No match. Try different search.'};
	if(ensdata.error){
		ensbtn.innerHTML = 'Error';
		$('#enserror').text(ensdata.error||'Unknown error. Try again.'); $('#enserror').fadeIn();
		setTimeout(function(){ ensbtn.innerHTML = 'Search'; $('#enserror').fadeOut(); },4000);
		return false;
	}
	else if(ensdata[0].type == 'gene'){
		ensemblmodel.ensid(ensdata[0].id);
		ensbtn.innerHTML = 'Got ID';
		setTimeout(function(){ ensbtn.innerHTML = 'Search'; },2000);
	}
	return false;
}

/* Validation of files in import dialog */
function checkfiles(filearr,fileroute,importmode){
	if(!importmode) importmode = '';
	var windowid = importmode? '#importdna' : '#import';
	var infodiv = $(windowid+' .back .windowcontent');
	if(!infodiv.length) return;
	var tickimg = $('<img class="icn mall" src="img/tick.png">'); //preload status icons
	var spinimg = $('<img class="icn small" src="img/spinner.gif">');
	var warnimg = $('<img class="icn small" src="img/warning.png">');
	
	// list files //
	var ajaxcalls=[];
	if(!$(windowid).hasClass('flipped')){
		var backbtn = $('<a class="button" style="padding-left:15px">&#x25C0; Back</a>');
		backbtn.click(function(){
			$.each(ajaxcalls,function(c,call){ if(call.readyState!=4){call.abort()}});
			ajaxcalls = []; //cancel hanging filetransfers
			filescontent = {};
			$(windowid).removeClass('finished flipped');
			setTimeout(function(){ $(windowid).addClass('finished') },900);
		});
		var list = $("<ul>");
		$.each(filearr,function(i,file){
			var filesize = file.size ? '<span class="note">('+numbertosize(file.size,'byte')+')</span> ' : '';
			list.append('<li class="file">'+file.name+' '+filesize+'<span class="icon"></span></li>');
		});
		var remotestr = fileroute=='download' ? ' remote ' : ' ';
		infodiv.empty().append('<b>Selected'+remotestr+'files</b><br>',list,'<br><span class="errors note"></span><br>',backbtn);
		$(windowid).addClass('flipped');
	}
	var errorspan = $('span.errors',infodiv);
	
  	// read files in //
  	var namelist = [];
	if($.isEmptyObject(filescontent)){
		errorspan.text('Loading files...');
		if(fileroute=='upload'||fileroute=='download'){ //via backend server
			if(model.offline()){
  				dialog('error','This file operation needs a backend server which is currently offline.'); return;
  			}
  			$.each(filearr,function(i,file){
  				namelist.push(file.name);
  				$(windowid+' .back li.file span.icon:eq('+i+')').empty().append(spinimg);
  				var successfunc = function(data){
        			$(windowid+' .back li.file span.icon:eq('+i+')').empty();
        			filescontent[file.name] = (data);
        			if(Object.keys(filescontent).length==filearr.length){ //all files received. Parse.
        				ajaxcalls = []; checkfiles(namelist,fileroute,importmode);
        			}
        		};
        		var senddata = fileroute=='upload'? {upfile:file} : {fileurl:file.url};
    			var ajaxcall = communicate(fileroute=='upload'?'echofile':'geturl',senddata,{success:successfunc});
    			ajaxcalls.push(ajaxcall);
    		});
    	} else if(fileroute=='localread'){ //direct read
    		$.each(filearr,function(i,file){
    			namelist.push(file.name);
    			var reader = new FileReader();  
    			reader.onload = function(evt){
    				filescontent[file.name] = evt.target.result;
    				if(Object.keys(filescontent).length==filearr.length) checkfiles(namelist,fileroute,importmode);
    		 	}
    		 	reader.readAsText(file);
    		});
  		}
  		return;
  	}
  
	// check files //
	var iconimg = '', accepted, rejected = [];
	$.each(filescontent,function(name){
		accepted = parseimport({filenames:[name],mode:'check'});
		if(accepted){ iconimg = tickimg.clone(); }
		else{ rejected.push(name); iconimg = warnimg.clone(); }
		$(windowid+' .back li.file span.icon:eq('+filearr.indexOf(name)+')').empty().append(iconimg);
	});
	
	// import //
	var importfunc = function(){
		errorspan.text('Importing data...');
		setTimeout(function(){ parseimport({source:fileroute,mode:importmode,dialog:$(windowid)}) }, 100);
	};
	if(rejected.length){
		var s = rejected.length>1? 's' : '';
		var msg = '<span class="red">Cannot recognize the "!"-marked file'+s+'.</span><br>Please change the file selection';
		var acceptlen = Object.keys(filescontent).length-rejected.length;
		if(acceptlen>0){
			$.each(rejected,function(r,name){ delete(filescontent[name]); });
			var importbtn = $('<a class="button" style="padding-left:15px">Import</a>');
			importbtn.click(function(){ importbtn.css('color','#999'); importfunc(); });
			$(windowid+' .windowcontent').append(importbtn);
			msg += ',<br> or proceed to import the recognized file'+(acceptlen>1?'s':'');
		}
		errorspan.html(msg+'.');
	}
	else importfunc();
}

//get an analysis datafile from local server
function getfile(filepath,importbtn,jobid){
	if(importbtn){
		importbtn = $(importbtn);
		importbtn.html('<img class="icn" src="img/spinner.gif">');
	} else importbtn = false;
    filescontent = {};
    var trycount = 0;
	var filefunc = function(){
	  $.ajax({
		type: "GET",
		url: filepath,
    	dataType: "text",
    	success: function(data){
    		filescontent[filepath.substr(filepath.lastIndexOf('/')+1)] = data;
        	setTimeout(function(){ parseimport({source:'import',id:jobid,importbtn:importbtn}) }, 100);
        	if(settingsmodel.keepid){ localStorage.currentid = JSON.stringify(jobid); localStorage.currentfile = JSON.stringify(filepath); }
    	},
    	error: function(xhrobj,status,msg){ 
        	if(!msg && status!="abort"){ //no response. try again
        		if(trycount<1){ trycount++; setTimeout(filefunc,1000); return; }
        		else{ msg = 'No response from server' }
        	}
        	if(importbtn) importbtn.html('Failed <span class="svgicon" style="margin-right:-10px" title="'+msg+'">'+svgicon('info')+'</span>');
        }
	  });
	}
	communicate('getimportmeta',{id:jobid},{success:filefunc,saveto:'importdata'}); //first get metadata, then imported file
}

//sequence row highlight
var hideborder = false;
function rowborder(data,hiding){
	if(hideborder) clearTimeout(hideborder);
	var top = data.starty||seqinfo(data).starty||0;
	var rborder = $("#rborder");
	var hidefunc = function(){ rborder.removeClass('opaque'); setTimeout(function(){ rborder.css('display','none') },300); };
	if(hiding=='hide'){ hidefunc(); return; }
	rborder.css('top',top+1);
	rborder.css('border: '+top);
	if(rborder.css('display')=='none') rborder.css({display:'block',height:model.boxh()+1});
	rborder.addClass('opaque');
	if(hiding!='keep') hideborder = setTimeout(hidefunc,3000);
}

//translate between sequence types
function translate(totype){
	if(model.seqtype()==totype) return;
	if((totype=='dna'||totype=='codons') && model.nodnasource()){ //ask for cDNA source
		var header = '<div class="sectiontext">To backtranslate a protein sequence, Wasabi needs the cDNA sequences used for the protein alignment.<br>'+
		'Please provide file(s) that contain all the sequences in current alignment.</div><br>';
		var filedrag = $('<div class="filedrag">Drag cDNA file here</div>');
		var fileroute = window.File && window.FileReader && window.FileList ? 'localread' : 'upload';
		filedrag.bind('dragover',function(evt){ //file drag area
			filedrag.addClass('dragover'); evt.stopPropagation(); evt.preventDefault();
    		evt.originalEvent.dataTransfer.dropEffect = 'copy';
    	}).bind('dragleave',function(evt){
			filedrag.removeClass('dragover'); evt.stopPropagation(); evt.preventDefault();
    	}).bind('drop',function(evt){
    		filedrag.removeClass('dragover'); evt.stopPropagation(); evt.preventDefault();
    		checkfiles(evt.originalEvent.dataTransfer.files,fileroute,'cdna');
    	});
		var fileinput = $('<input type="file" multiple style="opacity:0" name="file">');
		var form = $('<form enctype="multipart/form-data" style="position:absolute">');
		form.append(fileinput); filedrag.append(form);
		fileinput.change(function(){ checkfiles(this.files,fileroute,'cdna') });
		var selectbtn = $('<a class="button" style="vertical-align:0">Select files</a>');
		selectbtn.click(function(e){ fileinput.click(); e.preventDefault(); });
		var or = $('<span style="display:inline-block;font-size:18px;"> or </span>');
		
		var animclass = settingsmodel.windowanim()? 'zoomin' : '';
		var dialogwrap = $('<div id="importdna" class="popupwrap '+animclass+'"></div>');
		$("#page").append(dialogwrap);
		var dialogwindow = makewindow("Import cDNA data",[header,filedrag,or,selectbtn],{backfade:true,flipside:'front',icn:'import.png',btn:'Cancel'},dialogwrap);
		var flipdialog = makewindow("Importing",[],{backfade:false,flipside:'back',icn:'import.png'},dialogwrap);
		return;
	}
	
	var errors = [], nuc, midnuc, codon, aa, step, cdna = model.dnasource(), Tsequences = {}, fromtype = model.seqtype(), missinganc = false, tocase;
	var gaps = /[-_.:]+/g;
	var trimgap = function(m){ return m.length%3? m.substring(0,0-m.length%3) : m };
	$.each(sequences,function(name,seqarr){
		if(!cdna[name]){
			if(!$.isEmptyObject(treesvg)){ if(!leafnodes[name] || leafnodes[name].type=='ancestral') missinganc = true; }
			else errors.push('cDNA data is missing for "'+name+'"!');
			return true;
		}
		var curdna = cdna[name].join('').replace(gaps,trimgap);
		var tmpseq = [];
		if(fromtype=='protein'){ //backtranslation
			curdna = curdna.replace(gaps,'');
			var curlen = seqarr.join('').replace(gaps,'').length, seqpos = 0;
			if(curlen*3 != curdna.length){ errors.push('cDNA length doesn\'t match the sequence of "'+name+'"!'); return true; }
			$.each(seqarr,function(col,aa){
				if(gaps.test(aa)){ codon = aa+aa+aa; gaps.lastIndex = 0; }
				else{
					tocase = aa==symbols[aa].masked? 'toLowerCase' : 'toUpperCase';
					codon = curdna.substr(seqpos*3,3)[tocase]();
					seqpos++;
				}
				if(totype=='codons') tmpseq.push(codon); else tmpseq = tmpseq.concat(codon.split(''));
			});
		}
		else if(totype=='protein'){ //translation
			step = fromtype=='codons'? 1 : 3;
			if(step==3 && curdna.length%3){ errors.push('cDNA of "'+name+'" is not dividable to 3-base codons!'); return true; }
			for(var col=0; col<seqarr.length; col+=step){
				codon = step==3? seqarr.slice(col,col+3).join('') : seqarr[col]; //codon
				midnuc = codon.substr(1,1);
				tocase = letters.indexOf(midnuc)%2? 'toLowerCase' : 'toUpperCase';
				aa = /[-_.:]{3}/.test(codon)? midnuc : alphabet.codons[codon.toUpperCase()]? alphabet.codons[codon.toUpperCase()][tocase]() : '?';
				tmpseq.push(aa);
			}
		}
		else{ //dna<=>codons
			step = fromtype=='codons'? 1 : 3;
			if(step==3 && curdna.length%3){ errors.push('cDNA of "'+name+'" is not dividable to 3-base codons!'); return true; }
			for(var col=0; col<seqarr.length; col+=step){
				if(step==3) tmpseq.push(seqarr.slice(col,col+3).join('')); //dna=>codon
				else tmpseq = tmpseq.concat(seqarr[col].split('')); //codon=>dna
			}
		}
		Tsequences[name] = tmpseq;
	});
	if(errors.length){
		var ul = $('<ul>').css('white-space','normal');
		$.each(errors,function(i,error){ 
			if(i>4 && errors.length>6) error = '...not showing '+(errors.length-i)+' other errors....';
			ul.append('<li>'+error+'</li>');
			if(i>4) return false;
		});
		dialog('error',['Sequence translation failed:',ul]); return;
	}
	var applytrans = function(){
		sequences = Tsequences;
		var oldw = model.symbolw();
		model.seqtype(totype);
		var wrate = fromtype=='dna'? (1/3) : totype=='dna'? 3 : 1;
		if(wrate!=1){
			model.minseqlen(Math.round(model.minseqlen()*wrate));
			model.maxseqlen(Math.round(model.maxseqlen()*wrate));
			model.totalseqlen(Math.round(model.totalseqlen()*wrate));
			model.alignlen(Math.round(model.alignlen()*wrate));
		}
		model.visiblecols.removeAll();
		for(var c=0;c<model.alignlen();c++){ model.visiblecols.push(c) }
		redraw({zoom:true,refresh:true});
	};
	if(missinganc){
		var applybtn = $('<a class="button">Translate</a>').click(function(){ applytrans(); $('.closebtn','#transwarn').click(); });
		var content = 'The cDNA source does not have the ancestral sequences present in current alignment.<br>'+
		'Sequence translation will remove the ancestral sequences. Translate anyway?';
		makewindow("Warning",[content],{id:'transwarn',btn:['Cancel',applybtn],icn:'warning'});
	}
	else applytrans();
}

//check for a new version of a backend service
function checkversion(){
	communicate('geturl',{fileurl:'http://prank-msa.googlecode.com/git/VERSION_HISTORY'},
	{success:function(changelog){
		var startind = changelog.indexOf('v.')+2, endind = changelog.indexOf('v.',startind+1);
		var firstblock = changelog.substring(startind,endind);
		var sepind = firstblock.indexOf('- ');
		var lastver = parseInt(firstblock.substring(0,sepind-1)), lastchange = firstblock.substring(sepind+1);
		if(!isNaN(lastver)){ model.version.remote(lastver); model.version.lastchange = lastchange; }
	}});
}

/* Initiation on page load */
$(function(){
	dom = { seqwindow:$("#seqwindow"),seq:$("#seq"),wrap:$("#wrap"),treewrap:$("#treewrap"),tree:$("#tree"),names:$("#names") }; //global ref. of dom elements
	ko.applyBindings(model);
	
	//$("#zoombtns").hover(function(){$("#zoomperc").fadeIn()},function(){$("#zoomperc").fadeOut()});
	$("#treebin div").append(svgicon('trash'));
	
	var $left = $("#left"), $right = $("#right"), $dragline = $("#namesborderDragline"), $namedragger = $("#namesborderDrag"), draggerpos;
	
	$("#borderDrag").draggable({ //make sequence/tree width resizable
		axis: "x", 
		containment: [150,0,1000,0],
		start: function(e, dragger){ draggerpos = dragger.offset.left-$namedragger.offset().left+5; },
		drag: function(event, dragger) {
			$left.css('width',dragger.offset.left);
			$right.css('left',dragger.offset.left+10);
			$dragline.css('width',dragger.offset.left);
			$namedragger.css('left',dragger.offset.left-draggerpos);
		},
		stop: function(){
			$(window).trigger('resize');
		}
	});
	$namedragger.draggable({ //make names width resizable
		axis: "x", 
		containment: 'parent',
		drag: function(event, dragger) {
			dom.tree.css('right',$left.width()-dragger.offset.left-5);
			dom.names.css('width',$left.width()-dragger.offset.left-5);
		}
	});
	$("#namesborderDrag").hover(
		function(){$("#names").css('border-color','#aaa')},
		function(){$("#names").css('border-color','white')}
	);
	
	$("#names").mouseleave(function(e){ rowborder(e,'hide'); });
	
	//Add mouse click/move listeners to sequence window
	dom.seqwindow.mousedown(function(e){
	 e.preventDefault(); //disable image drag etc.
	 var startpos = {x:e.pageX,y:e.pageY};
	 if(e.pageY>dom.seqwindow.offset().top+30){ //in seq area
	  if(e.which==1 && e.target.tagName!='DIV'){ //act on left mouse button, outside of selections
	  	activeid = '';
		dom.seqwindow.mousemove(function(evt){ selectionsize(evt,'',startpos); });
		dom.seqwindow.one('mouseup',function(e){
	 		if(e.pageY>dom.seqwindow.offset().top+30){ //in seq area
	  			if(e.which==1 && e.target.tagName!='DIV' && $("div.canvasmenu").length==0){ //outside of selections
	  				var dx = e.pageX-startpos.x; var dy = e.pageY-startpos.y; 
	  				if(Math.sqrt(dx*dx+dy*dy)<10){ //no drag => higligh row and show position info
	  					var sdata = seqinfo(e);
	  					var arrowtype = e.pageY-dom.seqwindow.offset().top > dom.seqwindow.innerHeight()-90? 'bottom' : 'top';
	  					rowborder(sdata);
	  					tooltip(e,sdata.content,{container:"#seq",arrow:arrowtype,target:sdata});
	  				}
	  			}
	 		}
		});
	  }
	 $('html').one('mouseup',function(){ dom.seqwindow.unbind('mousemove'); if(toolsmodel.prunemode) toolsmodel.markLeafs(); });
	 }
	});
	
	var icon = function(type,title){
		title = title? 'title="'+title+'"' : '';
		return '<span class="svgicon" '+title+'>'+svgicon(type)+'</span>';
	}
	
	dom.seqwindow.bind('contextmenu',function(e){ //sequence area right click (pop-up menu)
		e.preventDefault(); //disable default right-click menu
		hidetooltip();
		if($.isEmptyObject(sequences)) return false;
		var maskcount = 0, data = {};
		for(var c=0;c<maskedcols.length;c++){ if(maskedcols[c]){ maskcount++; } }
		var mode = model.selmode();
	  	var over = e.target.id=='' ? e.target.parentNode : e.target;	
	  	activeid = ~over.id.indexOf('selection')||~over.id.indexOf('cross') ? over.id.substr(9) : false;
	  	var curactiveid = activeid;
		var selectcount = $('div[id^="selection"]').length;
		
		if(activeid){ //right-click on selection
			$("#seq div[class^='selection']").css({'border-color':'','color':''});
	  		$('#selection'+activeid+',#vertcross'+activeid+',#horicross'+activeid).css({'border-color':'orange','color':'orange'});
	  		
	  		var target = mode=='default'? 'selection area' : mode;
	  		var maskmenu = data[icon('mask')+' Mask '+target] = {click:function(e){maskdata(e,'mask'+target,activeid)}, submenu:{}};
	  		maskmenu['submenu'][icon('unmask')+' Unmask '+target] = function(e){maskdata(e,'unmask'+target,activeid)};
	  		if(selectcount>1){
	  			maskmenu['submenu'][icon('mask')+' Mask all '+selectcount+' selections'] = function(e){maskdata(e,'mask'+target)};
	  			maskmenu['submenu'][icon('unmask')+' Unmask all '+selectcount+' selections'] = function(e){maskdata(e,'unmask'+target)};
	  		}
			
			if(mode!='rows'){
				var hidecolmenu = data[icon('collapse')+' Collapse columns'] = {click:function(e){hidecolumns(e,curactiveid)}, submenu:{}};
				if(selectcount>1) var hidecolsubmenu = hidecolmenu['submenu'][icon('collapse')+' Collapse all selected columns'] = {click:function(e){hidecolumns(e)}};
			}
			if(mode!='columns' && model.treesource()){
				var hiderowmenu = data[icon('collapse')+' Collapse rows'] = {click:function(e){hiderows(e,curactiveid)}, submenu:{}};
				if(selectcount>1) var hiderowsubmenu = hiderowmenu['submenu'][icon('collapse')+' Collapse all selected rows'] = {click:function(e){hiderows(e)}};
			}
			
			var clearmenu = data[icon('selection')+' Clear selection'] = {'click':function(){clearselection(activeid)}, submenu:{}};
	  		if(selectcount>1) clearmenu['submenu'][icon('selections')+' Clear all selections'] = function(e){e.stopPropagation(); hidetooltip(); clearselection()};
	  		
	  		if(mode=='default'){ //preview row/columnselections
	  			hidecolmenu.mouseover = function(){toggleselection('show columns',activeid)};
	  			hidecolmenu.mouseout = function(){toggleselection('hide columns',activeid)};
	  			if(selectcount>1){
	  				hidecolsubmenu.mouseover = function(){toggleselection('show columns')};
	  				hidecolsubmenu.mouseout = function(){toggleselection('hide columns','',activeid)};
	  			}
	  			if(model.treesource()){
	  				hiderowmenu.mouseover = function(){toggleselection('show rows',activeid)}; 
	  				hiderowmenu.mouseout = function(){toggleselection('hide rows',activeid)};
	  				if(selectcount>1){
	  					hiderowsubmenu.mouseover = function(){toggleselection('show rows')};
	  					hiderowsubmenu.mouseout = function(){toggleselection('hide rows','',activeid)};
	  				}
	  			}
	  	  	}	
		}else{ //right-click outside of selection
			data[icon('unmask')+' Unmask all sequences'] = function(e){maskdata(e,'unmaskall')};
			if(model.hiddenlen()) data[icon('expand')+' Reveal '+model.hiddenlen()+' hidden columns'] = function(){showcolumns('all','hidetip')};
			if(maskcount) data[icon('collapse')+' Collapse '+maskcount+' masked columns'] = function(e){maskdata(e,'hidemaskedcols')};
			if(selectcount) data[icon('selections')+' Clear '+selectcount+' selections'] = function(e){e.stopPropagation(); hidetooltip(); clearselection()};
		}
	   	tooltip(e,'',{data:data}); //show menu
	}); //seq. area right-click
	
	// Load startup data //
	communicate('checkstatus');
	settingsmodel.loadprefs();
	if(settingsmodel.keepzoom() && localStorage.zoomlevel) model.zoomlevel(JSON.parse(localStorage.zoomlevel));
	if(typeof(localStorage.collapse)!='undefined') toggletop(localStorage.collapse);
	if(settingsmodel.onlaunch()=='import dialog'){ dialog('import'); }
	else if(settingsmodel.onlaunch()=='demo data'){ //use demo data
		$.ajax({type: "GET", url: "data/reference.xml", dataType: "text",
    	success: function(data){ filescontent = {}; filescontent[model.startfile] = data; parseimport({source:'localread'}); }
    	});
    }
	else if(settingsmodel.keepid && localStorage.currentid && localStorage.currentfile){
		getfile(JSON.parse(localStorage.currentfile),'',JSON.parse(localStorage.currentid));
	}
	setTimeout(function(){ communicate('alignstatus','','jobdata'); communicate('getmeta','','analysdata'); },500);
	
	//Loading-up done. Show menubar.
	setTimeout(function(){ $('#top').removeClass('away') }, 700);
	
	if(is.opera||(is.ie&&is.ver<9)) dialog('warning','This web application does not work well in Opera<br>or Internet Explorer web borwser.<br>'+
	'Please use one of the <a onclick="dialog(\'about\')">recommended</a> browsers.');
	
	checkversion();
});