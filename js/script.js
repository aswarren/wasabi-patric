//Web app for handling multiple alignment data from PRANK. 
//Author: Andres Veidenberg. Created Nov. 2011

//var start,now,end = new Date().getTime();

var sequences = {};
var treedata = {};
var names = {};
var colstep = 200;
var rowstep = 60;
var alphabet = '-.AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz?*'.split('');
var colors = {};
var symbols = {};
var lastselectionid = 0;
var activeid = false;
var canvaspos = [];
var colflags = [];
var visiblecols = ko.observableArray();
var rowflags = [];
var visiblerows = ko.observableArray();
var selections = [];
var maskedcols = [];
var filescontent = {};
var filetypes = {};
var serverdata = {'jobdata':ko.mapping.fromJS([],jobdataopt),'analysdata':ko.observableArray()};
var jobdataopt = {
	key: function(item){ return ko.utils.unwrapObservable(item.id); },
	create: function(args){ return new jobmodel(args.data); }
}
var jobmodel = function(data){ //generates html representation for every running job
	console.log('jobmodel:');
	console.log(data);
	ko.mapping.fromJS(data, {}, this);
    this.html = ko.computed(function() {
        var status = this.status();
		if(status!='running'){
			if(status=='0'){
				var outfiles = this.outfiles().split(',').join('\',\'');
				status = 'ready to import <a class="button" style="position:absolute;right:-5px;top:-5px" onclick="readfiles([\''+outfiles+'\'],this,\'import\')">Import</a>';
			}else{
				var err = 'Exit code '+status+'. Check log for details.';
				status = '<span style="color:red">error </span><img class="icn" src="img/help.png" title="'+err+'"> <a class="button" style="position:absolute;right:-5px;top:-5px" onclick="communicate(\'rmdir\',{\'dir\':\''+this.id()+'\')">Delete</a>';
			}
		}
		var now = new Date().getTime();
		var endtime = status=='running' ? now/1000 : parseInt(this.lasttime());
		var runningtime = numbertosize(endtime-parseInt(this.starttime()),'sec');
		var ltime = new Date(parseInt(this.lasttime())*1000);
		var lastdate = ltime.getDate()+'.'+ltime.getMonth()+'.'+ltime.getFullYear().toString().substr(2)+' at '+ltime.getHours()+':'+('0'+ltime.getMinutes()).slice(-2);
		return  '<div style="position:relative;min-width:310px"><span class="note">Status:</span> '+status+'<br><span class="note">Running time:</span> '+runningtime+'<br><span class="note">File directory:</span> '+this.id()+'<br><span class="note">Feedback <img src="img/file.png" class="icn" style="cursor:pointer;" onclick="showlog(this,\''+this.logfile()+'\')" title="Last update '+lastdate+'. Click for full log.">:</span><span class="logline"> '+this.log()+'</span></div>';
    }, this);
}

var myModel = function(){ //KnockOut viewmodel to keep the state of the system
	var self = this;
	self.zoomlevel = ko.observable(10);
	self.zoomperc = ko.computed(function(){ var l = self.zoomlevel(); return l==2 ? 'MIN' : l==20 ? 'MAX' : l*5+'%'; });
	self.boxw = ko.computed(function(){ return parseInt(self.zoomlevel()*1.5); });
	self.boxh = ko.computed(function(){ return parseInt(self.zoomlevel()*2); });
	self.fontsize = ko.computed(function(){ return parseInt(self.zoomlevel()*1.8); });
	self.nameswidth = ko.observable(50);
	self.namesw = ko.computed(function(){ return self.nameswidth()+'px'; });
	self.selmode = ko.observable('default');
	self.selmodes = [{mode:'default',icon:'\u25FB'},{mode:'columns',icon:'\u25A5'},{mode:'rows',icon:'\u25A4'}];
	self.selclass = ko.computed(function(){ return 'button '+self.selmode(); });
	self.setmode = function(data){ self.selmode(data.mode); togglemenu('selectmodemenu','hide'); toggleselection(data.mode); };
	self.filemenu = ['history','import','export','info'];
	self.fileclick = function(data){ dialog(data); togglemenu('filemenu','hide'); };
	self.runmenu = [{n:'Make alignment',c:'align'},{n:'Make guidetree',c:'tree'},{n:'Compact columns',c:'compact'},{n:'Test alginment',c:'test'}];
	self.runclick = function(data){ dialog(data.c); togglemenu('runmenu','hide'); };
	self.seqtype = ko.observable('residues');
	self.colorscheme = ko.observable('taylor');
	self.seqtype.subscribe(function(v){
		var val = v=='dna'||v=='rna' ? 'dna':'taylor';
		self.colorscheme(val);
		if(val=='dna'){ self.gaprate(0.025); self.gapext(0.75); self.isdna(true); }
		else{ self.gaprate(0.005); self.gapext(0.5); self.isdna(false); }
	});
	self.isdna = ko.observable(false);
	self.maxseqlen = ko.observable(0);
	self.maxseqlength = ko.computed(function(){ return numbertosize(self.maxseqlen(),self.seqtype()) });
	self.minseqlen = ko.observable(0);
	self.minseqlength = ko.computed(function(){ return numbertosize(self.minseqlen(),self.seqtype()) });
	self.alignlen = ko.observable(0);
	self.alignlength = ko.computed(function(){ return numbertosize(self.alignlen()) });
	self.alignheight = ko.computed(function(){ return visiblerows().length }).extend({throttle: 100});
	self.totalseqcount = ko.observable(0);
	self.seqdatasize = ko.computed(function(){ return numbertosize(self.alignlen()*self.totalseqcount(),self.seqtype()) });
	self.leafcount = ko.observable(0);
	self.nodecount = ko.observable(0);
	self.hiddenlen = ko.computed(function(){ return self.alignlen()-visiblecols().length; }).extend({throttle: 100});
	self.hiddenlength = ko.computed(function(){ return numbertosize(self.hiddenlen(),self.seqtype()) });
	self.treesource = ko.observable('');
	self.seqsource = ko.observable('');
	self.gaprate = ko.observable(0.005);
	self.gapext = ko.observable(0.5);
	/*self.runningjobs = ko.observableArray();
	self.readyjobs = ko.observableArray();
	self.importedjobs = ko.observableArray();
	self.jobstatus = function(jobid,data){
		if(!data){ return jobid ? jobdata[jobid] : jobdata; }
		else{
			if(!jobdata[jobid]){ self.runningjobs.push(jobid); jobdata[jobid] = data; } //new job data
			else{ $.each(data,function(k,val){ jobdata[jobid][k] = val }); } //update data

			if(data.status=='running'){ self.runningjobs.valueHasMutated(); }
			else if(data.status=='imported'){ obdata[jobid].status = 'imported'; self.readyjobs.remove(jobid); self.importedjobs.push(jobid) }
			else { self.runningjobs.remove(jobid); self.readyjobs.push(jobid) }
		}
	}
	self.showstatus = ko.computed(function(){ return self.runningjobs().length+self.readyjobs().length==0? false:true }).extend({throttle: 100});
	self.statusbtn = ko.computed(function(){
		var running = self.runningjobs().length; var ready = self.readyjobs().length; var str = '';
		if(running > 0){ var s = running>1? 's':''; str = running+' job'+s+' running'; }
		if(ready > 0){ var s = ready>1? 's':''; if(running>0) str+= ', '; else ready += ' job'+s; str+= ready+' finished'; }
		return str;
	}).extend({throttle: 100});
	self.statushtml = ko.computed(function(){
		var running = self.runningjobs().length; var ready = self.readyjobs().length;
		var html = {};
		
		return html;
	}).extend({throttle: 100});*/
	self.statusbtn = ko.computed(function(){
		var running=0,ready=0,str='';
		console.log(serverdata.jobdata());
		$.each(serverdata.jobdata(),function(i,job){
		console.log(job.status());
			if(job.status()=='running') running++;
			else if(job.status()!='imported') ready++;
		});
		if(running > 0){
			var s = running>1? 's':''; str = running+' job'+s+' running';
			setTimeout(function(){communicate('alignstatus','','jobdata')},1000); //update data in 1s
		}
		if(ready > 0){ var s = ready>1? 's':''; if(running>0) str+= ', '; else ready += ' job'+s; str+= ready+' finished'; }
		console.log(str);
		return str;
	}).extend({throttle: 100});;
};
ko.bindingHandlers.fadevisible = {
	init: function(element){ $(element).css('display','none') },
    update: function(element, value){
        var value = ko.utils.unwrapObservable(value());
        if (value == true) $(element).fadeIn(); else $(element).fadeOut();
    }
};
ko.bindingHandlers.slidevisible = {
	init: function(element){ $(element).css('display','none') },
    update: function(element, value){
        var value = ko.utils.unwrapObservable(value());
        if (value) $(element).slideDown();
    }
};
var model = new myModel();


function communicate(action,senddata,saveto){ //send and receive+save data from server fn(str,obj,[str])
	var optdata = new FormData();
	optdata.append('action',action);
	if(senddata) $.each(senddata,function(key,val){ opdata.append(key,val) });
	$.ajax({
		type: "POST",
		url: 'backend.php',
    	dataType: "text",
    	success: function(data){
    		if(typeof(saveto)=='string'){ //save server JSON data to local variable
    			if(typeof(serverdata[saveto])=='undefined'){
    				serverdata[saveto] = ko.mapping.fromJS(data,{key:function(item){ return ko.utils.unwrapObservable(item.id); }});
    			}
    			else{ ko.mapping.fromJSON(data,{},serverdata[saveto]);  }
    			console.log('communicate'); console.log(serverdata);
    		}
    	},
    	trycount: 0,
    	error: function(xhrobj,status,msg){
    		if(!msg&&status!="abort"){//no response. try again
        		if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        		else{ console.log('Server error.'); }
        	}
    	},
    	data: optdata,
        cache: false,
        contentType: false,
        processData: false
    });
}


function togglemenu(id,action,data){
	var menudiv = $('#'+id);
	if(typeof(action)=='undefined' || action==''){ var action = menudiv.parent().css('display')=='none' ? 'show' : 'hide'; }
	if(action=='show'){
		menudiv.parent().css('display','block');
		menudiv.animate({'margin-top':'-1px'},500,'easeOutExpo');
	}
	else if (action=='hide'){
		menudiv.animate({'margin-top':0-menudiv.innerHeight()-6},200,'linear',function(){ menudiv.parent().css('display','none'); });
	}
}

function numbertosize(number,type,min) {
	if(!type){ var type = 'other' } else if(type=='dna'||type=='rna'){ type = 'bp' }
    var sizes = type=='bp' ? [' bp',' kb',' Mb',' Gb'] : type=='byte' ? [' Bytes', ' KB', ' MB', ' GB'] : type=='sec'? [' sec',' min :',' h :'] : ['', '&#x2217;10<sup>3</sup>', '&#x2217;10<sup>6</sup>', '&#x2217;10<sup>9</sup>'];
    var order = type=='bp' ? 1024 : 1000;
    if(!min){ var min = type=='bp'||type=='byte'||type=='sec'? order : 1000000; }
    number = parseInt(number);
    if (number < min) return number+sizes[0];
    var i = 0;
    if(type=='sec'){
    	var str = '';
    	while(number>=order && i<sizes.length-1){ str = (number%order)+sizes[i]+' '+str; number = number/order; i++; }  
    	return str; //"3 h : 12 min : 36 sec"
    }
    else{
    	while(number>=order && i<sizes.length-1){ number = number/order; i++; }  
    	return number.toFixed(1).replace('.0','')+sizes[i]; //"2 KB" "1.3 Mb"
    }
};

function statushtml(kind){
	data = kind=='jobs'? jobdata : kind=='analysis'? analysdata : {};
	$.each(data,function(id,job){
			var status = job.status;
			if(status!='running'){
				if(status=='0'){
					var outfiles = job.outfiles.split(',').join('\',\'');
					status = 'ready to import <a class="button" style="position:absolute;right:-5px;top:-5px" onclick="readfiles([\''+outfiles+'\'],this,\'import\')">Import</a>';
				}else{
					var err = 'Exit code '+status+'. Check log for details.'; 
					if(jobdata.errfile) err+='. Error log: '+job.errfile; 
					status = '<span style="color:red">error </span><img class="icn" src="img/help.png" title="'+err+'"> <a class="button" style="position:absolute;right:-5px;top:-5px" onclick="deletedir(\''+id+'\',this)">Delete</a>'; }
			}
			var now = new Date().getTime();
			var endtime = status=='running' ? now/1000 : parseInt(job.lasttime);
			var runningtime = numbertosize(endtime-parseInt(job.starttime),'sec');
			var ltime = new Date(parseInt(job.lasttime)*1000);
			var lastdate = ltime.getDate()+'.'+ltime.getMonth()+'.'+ltime.getFullYear().toString().substr(2)+' at '+ltime.getHours()+':'+('0'+ltime.getMinutes()).slice(-2);
			html[id] =  '<div style="position:relative;min-width:310px"><span class="note">Status:</span> '+status+'<br><span class="note">Running time:</span> '+runningtime+'<br><span class="note">File directory:</span> '+id+'<br><span class="note">Feedback <img src="img/file.png" class="icn" style="cursor:pointer;" onclick="showlog(this,\''+job.logfile+'\')" title="Last update '+lastdate+'. Click for full log.">:</span><span class="logline"> '+job.log+'</span></div>';
		});
}


function parsefiles(dialogdiv){
	var errors = []; var notes = []; var treeoverwrite = false; var seqoverwrite = false;
	var Tnames = {}; var Tsequences = {}; var Ttreedata={}; var Ttreesource = ''; var Tseqsource = '';
	var Ttotalseqcount=0; var Tmaxseqlen=0; var Talignlen=0; var Tminseqlen=0; var Tleafcount = 0; var Tnodecount = 0;
	
	var filenames = Object.keys(filescontent);
	filenames.sort(function(a,b){ //sort filelist: [nexus,xml,phylip,other]
		return /\.ne?x/.test(a)? -1: /\.xml/.test(a)? /\.ne?x/.test(b)? 1:-1 : /\.ph/.test(a)? /\.ne?x|\.xml/.test(b)? 1:-1 : /\.ne?x|\.xml|\.ph/.test(b)? 1: 0;
	});
	$.each(filenames,function(i,filename){
		var file = filescontent[filename];
		if(/^<\w+>/.test(file)){ //xml
			if(file.indexOf("<phyloxml")!=-1){ //phyloxml tree fromat
				if(!$.isEmptyObject(Ttreedata)){ Ttreedata = {}; treeoverwrite = true; }
				Ttreesource = filename;
				Ttreedata = {phyloxml: file};
			}
			else{  //HSAML format (tree+sequences)
			  var newickdata = $(file).find("newick");
			  if(newickdata.length != 0){//newick tree found in xml
			  	if(!$.isEmptyObject(Ttreedata)){ Ttreedata = {}; treeoverwrite = true; }
			  	Ttreesource = filename;
				Ttreedata = {newick: newickdata.text()+';'};
			  }
			  var leafdata = $(file).find("leaf");
			  if(leafdata.length != 0){ if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }}
			  Tseqsource = filename;
   			  	leafdata.each(function(){
   				var id = $(this).attr("id");
   				var name = $(this).attr("name") ? $(this).attr("name") : '';
   				var tmpseq = $(this).find("sequence").text();
   				tmpseq = tmpseq.replace(/\s+/g,'');//remove whitespace
   				Tsequences[id] = tmpseq.split('');
   				Tnames[id] = name;
   			  });
   			  var nodedata = $(file).find("node");
   			  nodedata.each(function(){
   				var id = $(this).attr("id");
   				var name = $(this).attr("name") ? $(this).attr("name") : '';
   				var tmpseq = $(this).find("sequence").text();
   				if(tmpseq.length != 0){
   					tmpseq = tmpseq.replace(/\s+/g,'');
   					Tsequences[id] = tmpseq.split('');
   					Tnames[id] = name;
   				}
   			  });
   			}
   			if(newickdata.length!=0 && leafdata.length!=0){ return false }//got data, no more files needed
   		}
   		else if(/^>\s?\w+/m.test(file)){ //fasta
   			if(!$.isEmptyObject(Tsequences)){ seqoverwrite = true; }
   			Tseqsource += ' '+filename;
   			var nameexp = /^>\s?(\w+).*/mg;
   			var result = [];
   			while(result = nameexp.exec(file)){ //find nametags from fasta
   				var to = file.indexOf(">",nameexp.lastIndex);
   				if(to==-1){ to = file.length; }
   				var tmpseq = file.substring(nameexp.lastIndex,to); //get text between fasta tags
   				tmpseq = tmpseq.replace(/\s+/g,''); //remove whitespace
   				var name = result[1];
   				Tsequences[name] = tmpseq.split('');
   				Tnames[name] = name;
   			}
   		}
   		else if(/^clustal/i.test(file)){ //ClustalW MSA
   			if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }
   			Tseqsource = filename;
   			file = file.substring(file.search(/[\n\r]{2}/)); //remove first line
   			file = file.replace(/\s+/g," ").split(" "); //collapse space & split up
   			for(var j=0;j<file.length;j++){ //data array: [species1,sequence1,species2,…]
   				var name = file[j];
   				if(/[\w\#]{3,}/.test(name)){
   					if(!Tsequences[name]){ Tsequences[name] = ''; Tnames[name] = name; }
   					Tsequences[name].push(file[j+1].split(''));
   					j++;	
   				}
   			}
   		}
   		else if(/(\([\n\r])+\w+/.test(file)){ //newick tree in phylip format
   			var nwkstart = file.indexOf("(");
   			var nwkend = file.indexOf(";",nwkstart);
   			if(nwkend==-1){ nwkend = file.length }
   			Ttreedata = {newick: file.substring(nwkstart,nwkend).replace(/[\n\r]/,"") };
   			var seqstart = file.search(/\w+\s+[a-y]+[\n\r]/i);
   			if(seqstart!=-1){ //sequence data found in phylip file
   			  var sep = file.match(/[\n\r]{2}/)[0];
   			  if(sep){
   				if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }
   				Tseqsource = filename;
   				var seqend = seqstart<nwkstart ? nwkstart : file.length;
   				var seqblocks = file.substring(seqstart,seqend).split(sep);
   				var seqnames = []; var result = [];
   				while(result = /(\w+)\s+[a-y]+[\n\r]/ig.exec(seqblocks[0])){
   					var name = result[1];
   					seqnames.push(name); Tsequences[name] = []; Tnames[name] = name;
   				}
   				for(var b=0; b<seqblocks.length; b++){
   					var seqrows = seqblocks.split(/[\n\r]/);
   					if(seqrows.length!=seqnames.length){ console.log('phylip import error'); break; }
   					for(var n=0; n<seqnames.length; n++){
   						var name = seqnames[n];
   						var row = seqrows[n];
   						if(b==0){ //remove names from first datablock
   							row = row.substr(name.length);
   						}
   						Tsequences[name].push(row.split(''));
   					}
   				}
   				return false; //got data, no more files needed
   			  }
   			}
   		}
   		else if(file.indexOf("#NEXUS")!=-1){ //NEXUS
   			var blockexp = /begin (\w+);/igm;
   			var result = '', hastree=false, hasseq=false;
   			while(result = blockexp.exec(file)){ //parse data blocks
   				var blockname = result[1].toLowerCase();
   				if(blockname=='trees'||blockname=='data'){
   					if(blockname=='trees'){
   						if(!$.isEmptyObject(Ttreedata)){ Ttreedata = {}; treeoverwrite = true; }
   						Ttreesource = filename;
   						var blockstart = file.indexOf('(',blockexp.lastIndex);
   						var blockend = file.indexOf(';',blockstart);
   						var blocktxt = file.substring(blockstart,blockend); //collapse space in block content
   						Ttreedata = { newick: blocktxt+';' };
   						hastree = true;
   					}
   					else if(blockname=='data'){
   						if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }
   						Tseqsource = filename;
   						var blockstart = file.indexOf(file.match(/matrix/i)[0],blockexp.lastIndex);
   						var blockend = file.indexOf(';',blockstart);
   						var blocktxt = file.substring(blockstart+6,blockend).replace(/\s+/g," "); //collapse space in block content
   						blocktxt = blocktxt.split(/\s/);
   						for(var j=0;j<blocktxt.length;j++){ //excel data array: [species1,sequence1,species2,…]
   							var name = blocktxt[j]; 
   							if(/[\w\#]{3,}/.test(name)){ //expects chars [a-zA-Z_0-9#] in species names
   								if(!Tsequences[name]){ Tsequences[name] = []; Tnames[name] = name; }
   								Tsequences[name].push(blocktxt[j+1].split(''));
   								j++;	
   							}
   						}
   						hasseq = true;
   					}
   				}
   			}
   			if(hastree&&hasseq){ return false } //got tree&seq: break
   		}
   		else if(/\(\w+(:\d+\.?\d*)?,\w+(:\d+\.?\d*)?\)\S*(:\d+\.?\d*)?,\w+/.test(file)){ //newick tree
   			if(!$.isEmptyObject(Ttreedata)){ Ttreedata = {}; treeoverwrite = true; }
   			Ttreesource = filename;
   			Ttreedata = {newick: file};
   		}
   		else{ 
   			errors.push("Couldn't identify filetype for "+filename);
   		}
	});
	
	var namearr = [];
	if($.isEmptyObject(Tsequences)){ errors.push("No sequence data found") }
	else{ namearr = Object.keys(Tsequences); }
	
	visiblerows.removeAll();
	leafs = [];
	if($.isEmptyObject(Ttreedata)){
		//no tree: fill in data otherwise filled by jsPhyloSVG
		var nodecount = 0; var leafcount = namearr.length; Ttreesource = false;
		$.each(namearr,function(indx,id){
			leafs[id] = Tnames[id] ? {name:Tnames[id]} : {name:id};
			visiblerows.push(id); 
		});
	}
	else{
		var treetype = Ttreedata.phyloxml ? 'phyloxml' : 'newick';
		var nodecount = treetype=='phyloxml' ? $(file).find("clade").length : Ttreedata.newick.match(/\(/g).length;
		var leafcount = treetype=='phyloxml' ? $(file).find("name").length : Ttreedata.newick.match(/,/g).length+1;
		if(leafcount > namearr.length && !$.isEmptyObject(Tsequences)){ errors.push("Not enough sequences for all tree leafs"); }
		$.each(namearr,function(indx,name){
			if(Ttreedata[treetype].indexOf(name)==-1){ errors.push("Some sequence names missing from tree data <br> ('"+name+"' etc.)"); return false; }
		});
	}
	//var seqnames = Object.keys(Tnames).sort(); var treenames = Ttreedata.newick.match(/[a-z]+\w+/ig).sort();
	
	if(errors.length==0){ //no errors - use data from temporary variables
		if(dialogdiv){ setTimeout(function(){ dialogdiv.closest(".popupwindow").find(".closebtn").click() }, 2000); }//close import window
		if(treeoverwrite){ notes.push('Tree data found in multiple files. Using '+Ttreesource); }
		if(seqoverwrite){ notes.push('Sequence data found in multiple files. Using '+Tseqsource); }
		if(notes.length!=0){
			var ul = document.createElement("ul");
			$.each(notes,function(j,note){ $(ul).append("<li>"+note+"</li>") }); 
			setTimeout(function(){ makewindow('Notes',['<br>',ul,'<br>'],{btn:'OK'}); }, 5500); 
		}
		
		Tminseqlen = Tsequences[namearr[0]].length;
		var longestseq = '';
		for(var n=0;n<namearr.length;n++){ //count sequence lengths
			var tmpseq = Tsequences[namearr[n]].join('');
			if(tmpseq.length >= Talignlen){ Talignlen = tmpseq.length }
			tmpseq = tmpseq.replace(/-/g,'');
			var seqlen = tmpseq.length;
   			if(seqlen >= Tmaxseqlen){ Tmaxseqlen = seqlen; longestseq = tmpseq; }
   			if(seqlen <= Tminseqlen){ Tminseqlen = seqlen; }
		}
		longestseq = longestseq.replace(/[atgc]/ig,''); //check if a sequence consists of DNA symbols
		if(longestseq.length==0){ model.seqtype('dna') } else if(longestseq.replace(/u/ig,'').length==0){ model.seqtype('rna') } else{ model.seqtype('residues') }
		
		
		names = Tnames; sequences = Tsequences; model.totalseqcount(namearr.length); model.alignlen(Talignlen);
		model.minseqlen(Tminseqlen); model.maxseqlen(Tmaxseqlen);
		model.nodecount(nodecount); model.leafcount(leafcount); visiblecols.removeAll();
		treedata = Ttreedata; model.treesource(Ttreesource); model.seqsource(Tseqsource); first = true;
		for(var c=0;c<model.alignlen();c++){ visiblecols.push(c); }//mark hidden columns
		makecolors();
   		redraw();
	}
	else { 
		if(dialogdiv){ //diplay errors, no import
			var ul = document.createElement("ul");
			$(ul).css('color','red');
			$.each(errors,function(j,err){ $(ul).append("<li>"+err+"</li>") });
			dialogdiv.find("ul").after('<br><b>File import errors:</b><br>',ul);
		} else { console.log(errors); }
	}
}

function parseexport(filetype,options){
	if(typeof(options)=='undefined'){ options={} }
	var output = ''; var ids = [];
	if(options.includeanc) ids = Object.keys(sequences); else ids = Object.keys(leafs);
	if(filetype=='fasta'){
		$.each(ids,function(d,id){
			output += '>'+names[id]+"\n";
			for(var c=0;c<sequences[id].length;c+=50){
				output += sequences[id].slice(c,c+49).join('')+"\n";
			}
		});
	}
	else if(filetype=='newick'){
		output = options.includeanc? treedata.newick : treedata.newick.replace(/\#\d+\#/g,'');
		$.each(names,function(id,name){ //replace ids with names in tree file
			output = output.replace(id+':',name+':');
		});
	}
	return output;
}

function makecolors(){
	if(model.colorscheme()=='rainbow'){
   		colors = {'-':['#ccc','#fff'],'.':['#aaa','#fff'],'?':['#f00','#fff']};
   	}
   	else if(model.colorscheme()=='taylor'){
   		colors = { "A":["","rgb(204, 255, 0)"], "R":["","rgb(0, 0, 255)"], "N":["","rgb(204, 0, 255)"], "D":["","rgb(255, 0, 0)"], "C":["","rgb(255, 255, 0)"], "Q":["","rgb(255, 0, 204)"], "E":["","rgb(255, 0, 102)"], "G":["","rgb(255, 153, 0)"], "H":["","rgb(0, 102, 255)"], "I":["","rgb(102, 255, 0)"], "L":["","rgb(51, 255, 0)"], "K":["","rgb(102, 0, 255)"], "M":["","rgb(0, 255, 0)"], "F":["","rgb(0, 255, 102)"], "P":["","rgb(255, 204, 0)"], "S":["","rgb(255, 51, 0)"], "T":["","rgb(255, 102, 0)"], "W":["","rgb(0, 204, 255)"], "Y":["","rgb(0, 255, 204)"], "V":["","rgb(153, 255, 0)"], "B":["","rgb(255, 255, 255)"], "Z":["","rgb(255, 255, 255)"], "X":["","rgb(255, 255, 255)"], "-":["#ccc","rgb(255, 255, 255)"], "*":["","rgb(255, 255, 255)"], ".":["#999","rgb(210, 210, 210)"], "?":["#f00","rgb(255, 255, 255)"] };
   	}
   	else if(model.colorscheme()=='dna'){ colors = {"A":["","rgb(0,0,255)"],"T":["","rgb(255, 255, 0)"],"G":["","rgb(0, 255, 0)"],"C":["","rgb(255, 0, 0)"],"U":["","rgb(255, 255, 0)"]}; }
   	for(var i=0;i<alphabet.length;i++){ //make colors for whole alphabet (+darker bg for masked symbols)
   		var symbol = alphabet[i];
   		var unmasked = i%2==0 ? true : false;
   		if(model.colorscheme()=='rainbow'){
   			var color = unmasked ? rainbow(alphabet.length,i) : mixcolors(rainbow(alphabet.length,i-1),[100,100,100]);
   			if(!colors[symbol]){ colors[symbol] = ["",color]; }
   		}
   		else{
   			if(!colors[symbol]){ 
   				if(unmasked){ colors[symbol] = ["","rgb(200,200,200)"]; } //symbols outside of colorscheme: grey bg
   				else{ colors[symbol] = ["",mixcolors(colors[alphabet[i-1]][1],[100,100,100])]; }
   			}
   		}
   		var rgb = colors[symbol][1].match(/\d{1,3}/g);
   		var brightness = Math.sqrt(rgb[0]*rgb[0]*.241 + rgb[1]*rgb[1]*.691 + rgb[2]*rgb[2]*.068); //perceived brightness
   		var fgcolor = brightness<110 ? "#eee" : "#333"; //lettercolor for dark background
   		if(!colors[symbol][0]){ colors[symbol][0] = fgcolor; }
   		
   		symbols[symbol] = { 'fgcolor' : colors[symbol][0], 'bgcolor' : colors[symbol][1] };
   		symbols[symbol]['masked'] = unmasked ? alphabet[i+1] : symbol;
   		symbols[symbol]['unmasked'] = unmasked ? symbol : alphabet[i-1];
   	}
}

var first = true;
function redraw(zoom){
	canvaspos = []; colflags = []; rowflags = []; //reset flags
	lastselectionid = 0; activeid = false; $names = $("#names");
	$("#seq div").each(function(){ //remove selection boxes
		var id = $(this).attr('id') || '';
		if(id.indexOf('selection')!=-1||id.indexOf('cross')!=-1){ $(this).remove(); }
	});
	
	var newheight = visiblerows().length==0 ? model.leafcount()*model.boxh() : visiblerows().length*model.boxh();
	if(!zoom){ treewrap.css('height',newheight); $("#names svg").css('font-size',model.fontsize()+'px'); }
	if(first){//make tree and get visiblerows
		maskedcols = []; //reset variables
		counter = 0; treesvg = {}; Smits.Common.nodeIdIncrement = 0;
		$label = $("#namelabel"); $labelspan = $("#namelabel span");
		$("#tree").empty(); $names.empty();
		wrap.css('left',0); seq.css('margin-top',0);
		treewrap.css({top:0,height:newheight});
		if(model.treesource()){
			$("#notree").fadeOut(); $("#tree").css('box-shadow','none');
			$("#treewrap").css('background-color','white');
			treesvg = new Smits.PhyloCanvas(treedata, model.nameswidth(), treewrap.width(), newheight); 
		}
		else{
			$("#treewrap").css('background-color','transparent');
			$("#notree").fadeIn(); $("#tree").css('box-shadow','-2px 0 2px #ccc inset');
			$.each(names,function(name){
				var nspan = $('<span style="height:'+model.boxh()+'px;font-size:'+model.fontsize()+'px">'+name+'</span>');
				var hovertimer;
				nspan.mouseenter(function(){
					hovertimer = setTimeout(function(){
						$label.css({
							'font-size' : model.fontsize()+'px',
							'top': nspan.offset().top+'px',
							'left' : right.position().left-14+'px'
						});
						$labelspan.css('margin-left',0-$names.innerWidth()+5+'px'); $labelspan.text(name);
						$label.css('display','block'); setTimeout(function(){ $label.css('opacity',1) },50);
					},800);
				}); 
				nspan.mouseleave(function(){ 
					clearTimeout(hovertimer);
					$label.css('opacity',0);
					setTimeout(function(){$label.hide()},500); 
				});
				$names.append(nspan);
			});
		}
   		setTimeout(function(){treewrap.fadeTo(300,1,'linear')},10);
   	}
   	
	var newwidth = visiblecols().length*model.boxw();
	if(zoom){//keep sequence positioned in center of viewport after zoom
		seq.empty();
		var oldwidth = parseInt(seq.css('width')); var oldheight = parseInt(seq.css('height'));
		var left = ((newwidth/oldwidth)*(parseInt(wrap.css('left'))-(seqwindow.innerWidth()/2)))+(seqwindow.innerWidth()/2);
		if(left>0){ left = 0; } else if (Math.abs(left)>newwidth-seqwindow.innerWidth()){ left = seqwindow.innerWidth()-newwidth; }
		var visibleHeight = $("#left").height();
		var top = ((newheight/oldheight)*(parseInt(seq.css('margin-top'))-(visibleHeight/2)))+(visibleHeight/2);
		if(top<0&&newheight>visibleHeight&&Math.abs(top)>newheight-visibleHeight){ top = visibleHeight-newheight; }//keep bottom edge grounded
		if(top>0||newheight<visibleHeight){ top = 0; }//stick to top edge
		wrap.css('left',Math.round(left)); seq.css('margin-top',Math.round(top));
		treewrap.animate({height:newheight,top:Math.round(top)},500,'linear');
		if(model.treesource()){
			$("#names svg").animate({'font-size':model.fontsize()},500,'linear');
		}
		else{
			$("#names span").css({'height':model.boxh()+'px','font-size':model.fontsize()+'px'});
		}
	}
	seq.css({ 'width':newwidth, 'height':newheight });
	makeRuler();
	makeCanvases(); makeImage();
	if(first){ mCustomScrollbar(0,"easeOutCirc","auto","yes","yes",10); } else { $(window).trigger('resize'); }
	first = false;
}

function makeCanvases(){
	var tmpel,tmpcanv,letterw,maxletterw,fcanv;
	$.each(symbols,function(symbol,data){
		tmpel = document.createElement('canvas');
		tmpel.width = model.boxw();
		tmpel.height = model.boxh();
		tmpcanv = tmpel.getContext('2d');
		tmpcanv.fillStyle = data.bgcolor;
		if(model.zoomlevel()==1){ tmpcanv.fillRect(0,0,1,2); }
		else{ tmpcanv.fillRect(1,1,tmpel.width-1,tmpel.height-1); }
		if(model.fontsize() > 7){
			var canvassymbol = symbol=='.' ? '-' : symbol; //masked gap
			tmpcanv.font = model.fontsize()+"px monospace";
			tmpcanv.textAlign = 'center';
			tmpcanv.textBaseline = 'middle';
			tmpcanv.fillStyle = data.fgcolor;
			if(data.fgcolor=="#eee"){
				tmpcanv.shadowColor = "#111";
				tmpcanv.shadowOffsetX = 0;
				tmpcanv.shadowOffsetY = 1.5;
				tmpcanv.shadowBlur = 1;
			}
			else if(data.fgcolor=="#333"){
				tmpcanv.shadowColor = "#fff";
				tmpcanv.shadowOffsetX = 0;
				tmpcanv.shadowOffsetY = -0.5;
				tmpcanv.shadowBlur = 1;
			}
			tmpcanv.fillText(canvassymbol,tmpel.width/2+1,tmpel.height/2);
		}
		symbols[symbol]['canvas'] = tmpel;
	});
	//$.each(symbols,function(i,data){$('#top').append(' ',data.canvas)});
}

var tmpc = 0;
function makeImage(target){
	//var start = new Date().getTime();
	var targetx,targety;
	if(target){
		var tarr = target.split(':');
		if(tarr[0]=='x'){ targetx = parseInt(tarr[1]); } else if(tarr[0]=='y'){ targety = parseInt(tarr[1]); }
	}
	if(!targetx){ targetx = wrap.position().left; }
	if(!targety){ targety = parseInt(seq.css('margin-top')); }
	var colstartpix = parseInt((0-targetx)/model.boxw());
	var rowstartpix = parseInt((0-targety)/model.boxh());
	var colstart = colstartpix-(colstartpix%colstep); //snap to (colstep-paced) tile grid
	var colend = parseInt((seqwindow.innerWidth()-targetx)/model.boxw());
	if(colend>visiblecols().length){ colend = visiblecols().length; }
	var rowstart = rowstartpix-(rowstartpix%rowstep); //snap to grid
	var rowend = parseInt(((seqwindow.innerHeight()-ruler.outerHeight())-targety)/model.boxh());
	if(rowend>visiblerows().length){ rowend = visiblerows().length; }
	var rowdraws = [];
	var canvascount = 0;
	var totalcount = 0;
	for(var row = rowstart; row<rowend; row+=rowstep){
	  for(var col = colstart; col<colend; col+=colstep){
		if($.inArray(row+'|'+col,canvaspos) == -1){ //canvas not yet made
			canvaspos.push(row+'|'+col);
			rowdraws[row+'|'+col] = {};
			rowdraws[row+'|'+col].canvasrow = row;
			rowdraws[row+'|'+col].row = row;
			rowdraws[row+'|'+col].col = col;
			totalcount++;
			setTimeout(function(r,c){ return function(){
				canvascount++;
				var canvas = document.createElement('canvas');
				var div = document.createElement('div');
				canvas.width = colstep*model.boxw();
				canvas.height = rowstep*model.boxh();
				var endrow = rowdraws[r+'|'+c].row+rowstep>visiblerows().length ? visiblerows().length : rowdraws[r+'|'+c].row+rowstep;
				//var curstart = new Date().getTime();
				canvas.setAttribute('id',r+'|'+c);
				var canv = canvas.getContext('2d');
				//canv.clearRect(0,0,canvas.width,canvas.height);
				while(rowdraws[r+'|'+c].canvasrow < endrow){
					var data = sequences[visiblerows()[rowdraws[r+'|'+c].canvasrow]];
					var endcol = rowdraws[r+'|'+c].col+colstep>data.length ? data.length : rowdraws[r+'|'+c].col+colstep;
					for(var canvascol=c;canvascol<endcol;canvascol++){
						seqletter = data[visiblecols()[canvascol]];
						if(!symbols[seqletter]){ symbols[seqletter] = symbols['?'] }
						canv.drawImage( symbols[seqletter]['canvas'], (canvascol - rowdraws[r+'|'+c].col)*model.boxw()+1, (rowdraws[r+'|'+c].canvasrow - rowdraws[r+'|'+c].row)*model.boxh()+1);
					}
					rowdraws[r+'|'+c].canvasrow++;
				}
				$(div).css({'left': c*model.boxw()+'px', 'top': r*model.boxh()+'px'});
				seq.append(div);
				$(div).append(canvas);
				//var now = new Date().getTime(); console.log('CANVAS drawn. id: '+r+'|'+c+' ('+(now-curstart)+'ms) from start: '+(now-start)+' ms');
				rowdraws[r+'|'+c] = {};
				setTimeout(function(){ $(div).fadeTo(300,1,'linear', function(){ //fadein new canvas and remove any covered canvas.
							var pos1 = $(div).position(); var prevdivs = $(div).prevAll();
							prevdivs.each(function(){ var pos2 = $(this).position(); if(pos1.left==pos2.left&&pos1.top==pos2.top){ $(this).remove(); }});
						});},50);
				if(canvascount==totalcount){ if(spinner.css('display')=='block' ){ setTimeout(function(){spinner.fadeOut(200);},100); } }
			}}(row,col),10);
		}//make canvas	
	  }//for cols
	}//for rows
	if(totalcount>2){ spinner.css({'display':'block','opacity':1}); }
}


function makeRuler(){
	ruler.empty();
	var tick = 10;
	var tickw = tick*model.boxw()-4;
	var k = '';
	var markerdiv = function(scol,ecol){ //make markers for hidden columns
		var capindex = scol==0 ? 0 : visiblecols.indexOf(scol-1)+1;
		var l = capindex*model.boxw()-7;
		var colspan = ecol-scol;
		var div = $('<div class="marker" style="left:'+l+'px">&#x25BC</div>');
		div.mouseenter(function(e){ tooltip(e,'tooltip','Click to reveal '+colspan+' hidden columns.',div)});
		div.click(function(){
			for(var c=scol;c<ecol;c++,capindex++){ visiblecols.splice(capindex,0,c); } 
			hidetooltip(); redraw(); 
		});
		return div;
	}
	if(visiblecols()[0]!==0){ ruler.append(markerdiv(0,visiblecols()[0])); }
	for(var t=0;t<visiblecols().length-1;t++){
		if((visiblecols()[t+1]-visiblecols()[t])!=1){ ruler.append(markerdiv(visiblecols()[t]+1,visiblecols()[t+1])); }
	  	if(t%tick==0){//make ruler tickmarks
			k = t;
			if(model.boxw()<4){ if(t%100==0){ if(t>=1000){ k = '<span>'+(t/1000)+'K</span>'; }else{ k = '<span>'+t+'</span>'; } }else{ k = '&nbsp;'; } }
			ruler.append($('<span style="width:'+tickw+'px">'+k+'</span>'));
		}
	}
	if(visiblecols()[visiblecols().length-1] != model.alignlen()-1){
		ruler.append(markerdiv(visiblecols()[visiblecols().length-1]+1,model.alignlen()));
	}
}

function zoomin(){
	if(model.zoomlevel()<20){ model.zoomlevel(model.zoomlevel()+2); redraw('zoom'); }
}
function zoomout(){
	if(model.zoomlevel()>3){ model.zoomlevel(model.zoomlevel()-2); redraw('zoom'); }
}


//color palette: http://jsfiddle.net/k8NC2/1/  jalview color schemes
function rainbow(numOfSteps, step, adjust){
    //Generates vibrant, "evenly spaced" colours. Adapted from blog.adamcole.ca
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
    /*var lc = "#333";
    if(b==1&&r<0.3&&g<0.4){ lc = "#ddd"; } //dark background
    if(adjust){ r=(r+2)/3; g=(g+2)/3; b=(b+2)/3; lc="#333"; }//lighten
    var c = "#" + ("00" + (~ ~(r * 255)).toString(16)).slice(-2) + ("00" + (~ ~(g * 255)).toString(16)).slice(-2) + ("00" + (~ ~(b * 255)).toString(16)).slice(-2);
    return [lc,c];*/
    return 'rgb('+parseInt(r*255)+','+parseInt(g*255)+','+parseInt(b*255)+')';
}

function mixcolors(color,mix){
	var rgb = color.match(/\d{1,3}/g);
	var r = Math.floor((parseInt(rgb[0])+mix[0])/2);
	var g = Math.floor((parseInt(rgb[1])+mix[1])/2);
	var b = Math.floor((parseInt(rgb[2])+mix[2])/2);
	return "rgb("+r+","+g+","+b+")";
}

function tooltip(evt,type,title,node,data,svg){
	title = title.replace(/\#/g,'');
	if(type==''||type=='tooltip'){//generate tooltip divs
		var tipdiv = $('<div class="tooltip"></div>');
		var tiparrow = $('<div class="arrow"></div>');
		var tiptitle = $('<div class="tooltiptitle"></div>');
		var tipcontent = $('<div class="tooltipcontentwrap"></div>');
		var contdiv = $('<div class="tooltipcontent"></div>');
		contdiv.append(tipcontent);
		tipdiv.append(tiparrow,tiptitle,contdiv);
		$('body').append(tipdiv);
		contdiv.css({'position':'relative','top':'0'});
	}
	else{
		var tipid = type.indexOf('2')!=-1 ? '#tooltip2' : '#tooltip';
		var tipdiv = $(tipid);
		var tiptitle = $(tipid+' .tooltiptitle');
		var tipcontent = $(tipid+' .tooltipcontentwrap');
		var tiparrow = $(tipid+' .arrow');
	}
	if(tiptitle.css('display')=='none'){ tiptitle.css('display','block'); }
	tipcontent.text('');
	if(!svg){ //tooltip/menu placement
		tipdiv.css({'height':'auto','width':'auto'});
    	if(type.indexOf('2')!=-1){
    		if(node){
    			if(node=='namelabel'){ 
    				var x = $("#namelabel").offset().left+($("#namelabel").innerWidth()*0.2); 
    				var y = $("#namelabel").offset().top+$("#namelabel").innerHeight()+10;
    			}
    			else if(node.node){
    				var x = $(node.node).offset().left+($("#names").innerWidth()*0.2);
    				var y = $(node.node).offset().top+$("#namelabel").innerHeight()+10; 
    			}
    			//if(type.indexOf('right')!=-1){ var x = $(node.node).offset().left+26; }
    		} else { var x = evt.clientX-15; var y = evt.clientY+25; }
    		if(type.indexOf('right')!=-1){ tiparrow.css({'left':(tipdiv.innerWidth()/2)-8}); }
    	} else {
    		if(type==''||type=='tooltip'){ tiparrow.css('display','none'); }else{ tiparrow.css('display','block'); }
    		if(node){
    			if(node.edgeCircleHighlight){
    				var x = $(node.edgeCircleHighlight.node).offset().left+25;
    				var y = $(node.edgeCircleHighlight.node).offset().top-6;
    			} else {
    				if(node.tagName=='LI'){//submenu
    					var x = $(node).innerWidth()-5;
    					var y = $(node).position().top-3;
    				}
    				else{
    					var x = $(node).offset().left+$(node).innerWidth();
    					var y = $(node).offset().top+20;
    				}
    			}
    		} else { var x = evt.clientX+5; var y = evt.clientY; }
    	}
    	tipdiv.css({left:x,top:y});
	}
    if(data){ //pop-up menu
      if(svg){ //menu for tree (after a node click)
    	tiptitle.html(title+'  <span class="right"><span>\u2263</span>'+node._countAllChildren+' <span>\u2262</span>'+node._countAllHidden+'</span>');
    	tipdiv.css('height',tipdiv.innerHeight()+'px');
    	var ul = document.createElement('ul');
    	$.each(node.children,function(i,child){
    		var li = document.createElement('li');
    		var vis = child.visibility=='visible' ? true : false;
    		var litxt = vis ? 'Hide ' : 'Show ';
    		if (child.type == 'ancestral'){ litxt += 'ancestral sequence'; var icon=vis?'\u233F':'\u22EF'; }
    		else {
    			litxt += i==0 ? 'upper ' : 'lower ';
    			if(child.type=='stem'){ litxt += 'subtree';  var icon=vis?'\u2209':'\u22F2'; }else{ litxt += 'sequence'; var icon=vis?'\u233F':'\u2212'; }
    		}
    		$(li).text(icon+' '+litxt);
    		$(li).click(function(e){
    			$('#tooltip').css('display','none');
    			child.hideToggle(); 
				svg.svg1.clear();
				svg.svg2.clear();
				Smits.PhyloCanvas.Render.Phylogram(svg,data);
				redraw();
			});
			$(ul).append(li);
    	});
    	tipcontent.append(ul); //treemenu slidedown
    	tipdiv.animate({'height':'+='+tipcontent.innerHeight()},800,"easeOutElastic");
      }
      else{ //menu for canvas
      	tipdiv.addClass('canvasmenu');
      	var ul = document.createElement('ul');
      	var hassubmenu = false;
    	$.each(data,function(txt,obj){
    		var li = document.createElement('li');
    		if(typeof(obj)=='object'){ //nested menu
    			$(li).click(obj['click']);
    			if(obj['submenu']){//submenu
    				hassubmenu = true;
    				$(li).html(txt+'<span style="right:3px" class="right">\u25B8</span>');
    				$(li).mouseenter(function(evt){ tooltip(evt,'','',li,obj['submenu'])}); 
    			} else { $(li).html(txt); }
    			if(obj['mouseover']){ $(li).mouseenter(obj['mouseover']); }
    			if(obj['mouseout']){ $(li).mouseleave(obj['mouseout']); }
    		}
    		else{
    			$(li).html(txt);
    			$(li).click(obj);
			}
			$(ul).append(li);
    	});
    	tipcontent.append(ul);
    	if(title){ tiptitle.text(title); }else{ tiptitle.css('display','none'); $(ul).css('border-top','none');}
    	if(hassubmenu){ tipdiv.css('width',tipdiv.innerWidth()+13); }//extra width for arrow
    	if(node.tagName == 'LI'){//submenu
    		$(node).append(tipdiv);
    		$(node).mouseleave(function(e){ hidetooltip(tipdiv); $(node).unbind('mouseout'); }); 
    	}
    	var rightedge = seqwindow.offset().left+seqwindow.innerWidth()-300;
    	if(x > rightedge){ tipdiv.css("left",rightedge); }
      	$('html').click(function(){ hidetooltip(); $('html').unbind('click'); });
      	tipdiv.fadeIn(200);
     }
   }else{ //tooltip
    	if(type=='3'){//fix tooltip width after a tree node click
    		var testhtml = node.children[1].visibility=='visible' ? '\u233F Hide ':'\u22EF Show ';
    		tiptitle.html(testhtml+'ancestral sequence'); //testcontent to calculate maxwidth
    		var width = tipdiv.innerWidth()-2;
    		tiptitle.text('');
    		tiptitle.text(title);
    		var maxwidth = width > tipdiv.innerWidth() ? width : tipdiv.innerWidth();
    		tipdiv.css('width',maxwidth);
    	}
    	tiptitle.html(title);
    	if(type=='tooltip'&&node){
    		var rightedge = seqwindow.offset().left+seqwindow.innerWidth()-200;
    		if(x > rightedge){ tipdiv.css("left",rightedge); }
    		node.mouseleave(function(){ hidetooltip(tipdiv); });
    	}//hide mousehover tooltip
    	else { $('html').mousedown(function(){ hidetooltip(); $('html').unbind('mousedown'); }); }
    	tipdiv.fadeIn(200,function(){if(tipdiv.css('opacity')!=1){tipdiv.css('opacity',1);}});
    	if(type!='3'){ setTimeout(function(){tipdiv.fadeOut(200)},3000); }//autohide info tooltips
   }
   return tipdiv;
}

function hidetooltip(tooltip){
	tooltip = tooltip || '';
	if(typeof(tooltip)=='object'){ $(tooltip).fadeOut(200,function(){$(tooltip).remove()}); }
	else if (tooltip==''){
		$("div.tooltip").each(function(){
			if(this.id == ''){ $(this).fadeOut(200,function(){ $(this).remove(); }); }
			//else{ $('html').trigger('click'); }
		});
		if(activeid){
	  		$('#selection'+activeid+',#vertcross'+activeid+',#horicross'+activeid).css({'border-color':'','color':''});
			activeid = false; 
		}
	}
	else{
		if(tooltip.indexOf('2')!=-1){ $('#tooltip2').fadeOut(200); }
		else { 
			if($('#tooltip').css('display')!='none'){
				$('#tooltip').fadeOut(200,function(){ $('#tooltip .tooltipcontentwrap').text(''); });
			} else { $('#tooltip .tooltipcontentwrap').text(''); }
		}
	}
}

function selectionsize(e,id,type){
	if(typeof(type)=='undefined'){ var type = 'rb' }
	else if(typeof(type)=='object'&&type.x&&type.y){//type=mouse startpos
		var dx = e.pageX-type.x; var dy = e.pageY-type.y;
		if(Math.sqrt(dx*dx+dy*dy)<10){ return; }
		else{ type = 'rb' }
	}
	if($("#selection"+id).length==0){//selectionbox needs to be created
		seq.append('<div id="selection'+id+'" class="selection"><div class="description"></div><div class="ltresize"></div><div class="rbresize"></div></div>\
			<div id="vertcross'+id+'" class="selectioncross"><div class="lresize"></div><div class="rresize"></div></div>\
			<div id="horicross'+id+'" class="selectioncross"><div class="tresize"></div><div class="bresize"></div></div>');
		var x = e.pageX-seq.offset().left-5;
		x = x-(x%model.boxw());
		var y = e.pageY-seq.offset().top;
		y = y-(y%model.boxh());
		if(x<0){ x=0; } if(y<0){ y=0; }
		$("#selection"+id).css({'left':x,'top':y,'width':model.boxw(),'height':model.boxh(),'display':'block'});
		$("#vertcross"+id).css({'left':x,'top':'0','width':model.boxw(),'height':seq.innerHeight(),'display':model.selmode()=='columns'?'block':'none'});
		$("#horicross"+id).css({'left':'0','top':y,'width':seq.innerWidth(),'height':model.boxh(),'display':model.selmode()=='rows'?'block':'none'});
		$("#selection"+id).mouseenter(function(){ $("#selection"+id+" div.rbresize, #selection"+id+" div.ltresize").css('opacity','1'); });
		$("#selection"+id).mouseleave(function(){ $("#selection"+id+" div.rbresize, #selection"+id+" div.ltresize").css('opacity','0'); });
		$("#vertcross"+id).mouseenter(function(){ $("#vertcross"+id+" div.lresize, #vertcross"+id+" div.rresize").css('opacity','1'); });
		$("#vertcross"+id).mouseleave(function(){ $("#vertcross"+id+" div.lresize, #vertcross"+id+" div.rresize").css('opacity','0'); });
		$("#horicross"+id).mouseenter(function(){ $("#horicross"+id+" div.tresize, #horicross"+id+" div.bresize").css('opacity','1'); });
		$("#horicross"+id).mouseleave(function(){ $("#horicross"+id+" div.tresize, #horicross"+id+" div.bresize").css('opacity','0'); });
		$("#selection"+id+" div.rbresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'rb'); });
		});
		$("#selection"+id+" div.ltresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'lt'); });
		});
		$("#vertcross"+id+" div.rresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'r'); });
		});
		$("#vertcross"+id+" div.lresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'l'); });
		});
		$("#horicross"+id+" div.bresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'b'); });
		});
		$("#horicross"+id+" div.tresize").mousedown(function(){
			seqwindow.mousemove(function(evt){ selectionsize(evt,id,'t'); });
		});
		lastselectionid++;
	}
	else {//resize existing box
		var over = e.target.id ? e.target : e.target.parentNode;
		if(over.tagName=='DIV'&&id!=over.id.substr(0-id.toString().length)){ return false; }//avoid overlap
		var seldiv = $("#selection"+id);
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

function registerselections(id){//set flags in selection vectors
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
	else{ $("#seq div.selection").each(function(){ id = this.id.substr(9); $("#selection"+id).remove(); $("#vertcross"+id).remove(); $("#horicross"+id).remove(); }); }
}

function toggleselection(type){
	if(type=='default'){ toggleselection('hide rows'); type='hide columns'; }
	else if(type=='columns'){ toggleselection('hide rows'); type='show columns'; }
	else if(type=='rows'){ toggleselection('show rows'); type='hide columns'; }
	var divs = type.indexOf('rows')!=-1 ? $('div[id^="horicross"]') : ('div[id^="vertcross"]');
	$(divs).each(function(){
		if(type.indexOf('show')!=-1){ $(this).fadeIn(200); } else { $(this).fadeOut(200); }
	}); 
}

function seqinfo(e){
	var x = e.pageX-seq.offset().left-2;
	x = parseInt(x/model.boxw());
	var y = e.pageY-seq.offset().top-2;
	y = parseInt(y/model.boxh());
	if(x<0){ x=0; } if(y<0){ y=0; }
	var col = visiblecols()[x]; var rowid = visiblerows()[y];
	var suppl = col==x ? '' : ' (col '+(col+1)+' if uncollapsed)';
	var symb = typeof(sequences[rowid][col])=='undefined' ? '' : sequences[rowid][col];
	var name = typeof(leafs[rowid])=='undefined' ? '' : '<br>'+leafs[rowid].name;
	return '<span style="color:orange">'+symb+'</span> row '+(y+1)+' column '+(x+1)+suppl+name;
}

function hidecolumns(e,id){
	e.stopPropagation(); hidetooltip();
	registerselections(id);
	var adj = 0; //adjustment for  array length decrease
	for(var c=0;c<colflags.length;c++){ if(colflags[c]){ visiblecols.splice(c-adj,1); adj++; } }//remove columns from list
	redraw();
}

function togglerows(e,id,action){
	e.stopPropagation(); hidetooltip();
	var idarr = [];
	if(action=='selection'){//hide selected rows
		action = 'hide';
		registerselections(id);
		for(var r=0;r<rowflags.length;r++){ if(rowflags[r]){ idarr.push(visiblerows()[r]); } } 
	}//else: hide/show from tree
	if(typeof(idarr) != 'object'){ idarr = [idarr]; }
	for(var i=0;i<idarr.length;i++){ leafs[idarr[i]].hideToggle(action); }
	var svg = treesvg.getSvg();
	var data = treesvg.getPhylogram().getData();
	svg.svg1.clear();
	svg.svg2.clear();
	Smits.PhyloCanvas.Render.Phylogram(svg,data);
	redraw();
}

function maskdata(e,id,action){
	if(e){ e.stopPropagation(); hidetooltip(); }
	registerselections(id);
	if(action=='maskcols'||action=='unmaskcols'){
		if(action=='maskcols'){ var symboltype = 'masked'; var flag = 1; }
		else{ var symboltype = 'unmasked'; var flag = false; }
		for(var c=0;c<colflags.length;c++){
			if(colflags[c]){
				var colid = visiblecols()[c];
				for(var id in sequences){ if(visiblerows.indexOf(id)!=-1){ sequences[id][colid] = symbols[sequences[id][colid]][symboltype]; }}
				maskedcols[colid] = flag;
			}
		}
	}
	else if(action=='maskrows'||action=='unmaskrows'){
		if(action=='maskrows'){ var symboltype = 'masked'; var flag = 1; }
		else{ var symboltype = 'unmasked'; var flag = false; }
		for(var r=0;r<rowflags.length;r++){
			if(rowflags[r]){
				var id = visiblerows()[r];
				for(var i=0;i<sequences[id].length;i++){ sequences[id][i] = symbols[sequences[id][i]][symboltype]; }
			}
		}
	}
	else if(action=='maskselection'||action=='unmaskselection'){
		if(action=='maskselection'){ var symboltype = 'masked'; var flag = 1; }
		else{ var symboltype = 'unmasked'; var flag = false; }
		for(var s=0;s<selections.length;s++){
			var sel = selections[s];
			for(var c=sel.colstart;c<=sel.colend;c++){
				var colid = visiblecols()[c];
				for(var r=sel.rowstart;r<sel.rowend;r++){
					var id = visiblerows()[r];
					sequences[id][colid] = symbols[sequences[id][colid]][symboltype];
				}
				if(!flag){ maskedcols[colid] = false; }
			}
		}
	}
	else if(action=='hidemaskedcols'){
		for(var c=0;c<maskedcols.length;c++){ 
			if(maskedcols[c]){
				var colind = visiblecols.indexOf(c);
				if(colind != -1){ visiblecols.splice(colind,1); }
			} 
		}
	}
	redraw();
}

function showlog(btn,logfile){
	var logdiv = $(btn).closest('div').next('div.logdiv');
	if(logdiv.length==0){ //logdiv not yet created
		logdiv = $('<div class="insidediv logdiv" style="display:none">');
		$(btn).closest('div').after(logdiv);
	}
	else{
		logdiv.slideUp(200,function(){logdiv.remove()});
		return;
	}
	$.ajax({ //download file to div
		type: "GET",
		url: logfile,
    	dataType: "text",
    	success: function(data){
    		logdiv.html('<pre>'+data+'</pre>');
    		logdiv.slideDown();
    	},
    	error: function(){ logdiv.html('Failed to load the log file.'); logdiv.slideDown(); }
    });
}

function showdir(dir,btn,importdialog){
	btn = $(btn);
	var logdiv = btn.parent().next('div.logdiv');
	if(logdiv.length==0){ //logdiv not yet created
		btn.addClass('rotateddown');
		logdiv = $('<div class="insidediv logdiv" style="display:none">');
		btn.parent().after(logdiv);
	}
	else{
		btn.removeClass('rotateddown');
		logdiv.slideUp(200,function(){logdiv.remove()});
		return;
	}
	var optdata = new FormData();
	optdata.append('action','getdir');
	optdata.append('dir',dir);
	if(importdialog) optdata.append('subdir','yes');
	$.ajax({ //download filelist to div
		type: "POST",
		url: 'backend.php',
    	dataType: "text",
    	success: function(data){
    		data = data.split('|');
    		if(data.length<5){ logdiv.html('No importable files in directory.'); logdiv.slideDown(); return; }
    		logdiv.html(data.join('<br>'));
    		logdiv.slideDown();
    	},
    	trycount: 0,
    	error: function(xhrobj,status,msg){
    		if(!msg&&status!="abort"){//no response. try again
        		if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        		else{ logdiv.html('Server error.'); logdiv.slideDown(); }
        	}
    	},
    	data: optdata,
        cache: false,
        contentType: false,
        processData: false
    });
}

function deletedir(dir,btn){
	btn = $(btn);
	btn.html('Deleting');
    btn.css({'opacity':0.6,'cursor':'default'});
	var optdata = new FormData();
	optdata.append('action','rmdir');
	optdata.append('dir',dir);
	$.ajax({ //request to rm dir
		type: "POST",
		url: 'backend.php',
    	dataType: "text",
    	success: function(data){
    		btn.html('Deleted');
    		
    	},
    	trycount: 0,
    	error: function(xhrobj,status,msg){
    		if(!msg&&status!="abort"){//no response. try again
        		if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        		else{ btn.html('Failed'); btn.attr('title','Server error. '+msg); }
        	}
    	},
    	data: optdata,
        cache: false,
        contentType: false,
        processData: false
    });
}

function makewindow(title,content,options,container){ //(string,array(,obj{flipside:'front'|'back',backfade,btn:string|jQObj|array,id:string},jQObj))
	if(!options){ var options = {}; }
	if(options.flipside){ //we make two-sided window
		var sideclass = 'side '+options.flipside;
	} else { var sideclass = '';}
	var windowdiv = $('<div class="popupwindow '+sideclass+'"></div>');
	var shade = $("#backfade");
	var closebtn = $('<img src="img/closebtn.png" class="closebtn">');
	var closefunc = function(){
		windowdiv.remove(); 
		if(container){ container.remove() } 
		if(shade.css('display')!='none'){ shade.css('opacity',0); setTimeout(function(){shade.hide()},400); }};
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
	if(options.icn) title = '<img class="windowicn" src="img/'+options.icn+'"> '+title;
	titlediv.html(title);
	$.each(content,function(i,val){ contentdiv.append(val) });
	windowdiv.append(contentdiv,titlediv,closebtn);
	if(container){ container.append(windowdiv); var dragdiv = container; }
	else{ $("#page").append(windowdiv); var dragdiv = windowdiv; }
	dragdiv.draggable({ //make window draggable by its title
		handle : "div.windowtitle",
		containment : "#page"
	});
	if(options.backfade){ shade.css('display','block'); setTimeout(function(){shade.css('opacity',1)},50); }
	if(options.id) windowdiv.attr('id',options.id);
	if($('div.popupwindow').length>0){ //keep a new window top of other windows
		var maxZ = Math.max.apply(null, $.map($('div.popupwindow'), function(e,i){ return parseInt($(e).css('z-index'))||1; }));
		windowdiv.css('z-index',maxZ+1);
	}
	windowdiv.mousedown(function(){ //keep selected window top of other windows
			var maxZ = Math.max.apply(null, $.map($('div.popupwindow'), function(e,i){ return parseInt($(e).css('z-index'))||1; }));
			if(parseInt($(this).css('z-index')) < maxZ) $(this).css('z-index',maxZ+1);
    });
	return windowdiv;
}

function dialog(type){
	var helpimg = $('<img class="icn" src="img/help.png">');
	if(type=='import'){
		$('div.popupwindow').remove(); //close other windows
		var infodiv = $("<div>");
		var fileroute = window.File && window.FileReader && window.FileList ? 'localread' : 'upload';
		var filedrag = $('<div class="filedrag">Drag files here</div>');
		filedrag.bind('dragover',function(evt){
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
    		readfiles(evt.originalEvent.dataTransfer.files,infodiv,fileroute);
    	});
		var fileinput = $('<input type="file" multiple style="opacity:0" name="upfile">');
		var form = $('<form enctype="multipart/form-data" style="position:absolute">');
		form.append(fileinput);
		filedrag.append(form);
		fileinput.change(function(){ readfiles(this.files,infodiv,fileroute) });
		var selectbtn = $('<a class="button" style="vertical-align:0">Select files</a>');
		selectbtn.click(function(e){ fileinput.click(); e.preventDefault(); });
		var ordiv = $('<div style="display:inline-block;font-size:18px;"> or </div>');
		
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
			$(".windowcontent input.url").each(function(i,input){
				var val = $(input).val();
				//if($(input).next("span.icon").children("img").attr("src").indexOf("tick")!=-1){
					var filename = val.substr(val.lastIndexOf('/')+1);
					urlarr.push({ name:filename, url:val }); 
				//}
			});
			readfiles(urlarr,infodiv,'download'); 
		});
		
		var dirarr1 = $('<span class="rotateable" style="color:#666">&#x25BA;</span>');
		dirarr1.click(function(){ showdir('data',this,infodiv) });
		var dirspan1 = $('<span> Example data</span>').prepend(dirarr1);
		var dirarr2 = $('<span class="rotateable" style="color:#666">&#x25BA;</span>');
		dirarr2.click(function(){ showdir('output',this,infodiv) });
		var dirspan2 = $('<span> Aligned data</span>').prepend(dirarr2);
		
		var dialogwrap = $('<div class="popupwrap"></div>');
		$("#page").append(dialogwrap);
		var desc = '<b>Import local files</b> <img src="img/info.png" class="icn" title="Select file(s) that contain aligned or unaligned '+
		'sequence (and tree) data. Supported filetypes: fasta, newick (.tree), HSAML (.xml), NEXUS, phylip, ClustalW (.aln), phyloXML"><br><br>';
		var dialog = makewindow("Import files",[desc,filedrag,ordiv,selectbtn,
			"<br><hr><b>Import remote files</b><br><br>",urladd,urlinput,'<span class="icon"></span><br>',dwnlbtn,'<hr><b>Import files from server</b><br><br>',dirspan1,'<br><br>',dirspan2],{backfade:true,flipside:'front',icn:'import.png'},dialogwrap);
		var flipdialog = makewindow("Import data",[infodiv],{backfade:false,flipside:'back',icn:'import.png'},dialogwrap);
	} //import dialog
	else if(type=='export'){
		var dialog = makewindow("Export data",["<b>Export data</b><ul><li>Write to local files</li><li>Export options (soft/hard masking etc.)</li></ul><br>"],{btn:'OK',icn:'export.png'});
	}
	else if(type=='info'){
		var list = $("<ul>");
		if(model.treesource()){
			list.append('<li>Number of nodes: <span data-bind="text:nodecount"></span></li>');
			list.append('<li>Number of leafs: <span data-bind="text:leafcount"></span></li>');
		}
		list.append('<li>Number of sequences: <span data-bind="text:totalseqcount"></span>, in total of <span data-bind="html:seqdatasize"></span> '+
		'<span data-bind="{visible:seqtype()==\'residues\',text:seqtype}"></span></li>');
		list.append('<li>Sequence length: <span data-bind="html:minseqlength"></span> to <span data-bind="html:maxseqlength"></span> '+
		'<span data-bind="{visible:seqtype()==\'residues\',text:seqtype}"></span></li>');
		list.append('<li>Alignment length: <span data-bind="html:alignlength"></span> columns <span data-bind="visible:hiddenlen">(<span data-bind="text:hiddenlen"></span> columns hidden)</span></li>');
		list.append('<li>Alignment height: <span data-bind="text:alignheight"></span> rows</li>');
		if(model.treesource()){ list.append('<li>Tree data source: <span data-bind="text:treesource"></span></li>'); }
		list.append('<li>Sequence data source: <span data-bind="text:seqsource"></span></li>');
		var dialogdiv = makewindow("Data information",[list],{btn:'OK',icn:'info.png'});
		ko.applyBindings(model,dialogdiv[0]);
	}
	else if(type=='align'){
		//var expbtn = $('<img src="img/plus.png" class="icn optadd">');
		var expbtn = $('<span class="rotateable texticn">&#x2295;</span>');
		expbtn.click(function(e){
			e.stopPropagation();
			var expdiv = $(this).parent().next(".insidediv");
			if(expdiv.css('display')=='none'){ $(this).addClass('rotated'); expdiv.slideDown(); infospan.fadeIn(); }
			else{ $(this).removeClass('rotated'); expdiv.slideUp(); infospan.fadeOut(); }
		});
		var infospan = $('<span class="note" style="display:none;margin-left:20px">Hover options for description</span>');
		var opttitle = $('<div style="cursor:pointer">').append(expbtn,"Alignment options",infospan).click(function(){expbtn.click()});
		var optdiv = $('<div class="insidediv" style="display:none">');
		var treecheck = model.treesource()?'':'checked="checked"';
		var optform = $('<form id="optform" onsubmit="return false">'+
		'<input type="checkbox" name="newtree" data-bind="enable:treesource" '+treecheck+'><span class="label" title="Checking this option builds a new guidetree for the sequence alignment process (otherwise uses the current tree).">make new tree</span>'+
		'<br><input type="checkbox" checked="checked" name="anchor"><span class="label" title="Use Exonerate anchoring to speed up alignment">alignment anchoring</span> '+
		'<br><input type="checkbox" name="e"><span class="label" title="Checking this option keeps current alignment intact (pre-aligned sequences) and only adds sequences for ancestral nodes.">keep current alignment</span>'+
		'<br><br><b>Model parameters:</b><hr style="color:white">'+
		'<input type="checkbox" checked="checked" name="F"><span class="label" title="Enabling this option is generally beneficial but may cause an excess of gaps if the guide tree is incorrect">trust insertions (+F)</span>'+
		'<br><span class="label" title="Gap opening rate">gap rate</span> <input type="text" name="gaprate" style="width:50px" data-bind="value:gaprate">'+
		' <span class="label" title="Gap length">gap length</span> <input type="text" name="gapext" data-bind="value:gapext">'+
		' <span class="label" title="Κ defines the ts/tv rate ratio for the HKY model that is used to compute the substitution scores for DNA alignments" data-bind="visible:isdna">K</span> <input type="text" name="kappa" data-bind="visible:isdna">'+
		'<br><span class="label" title="Default values are empirical, based on the input data." data-bind="visible:isdna">DNA base frequencies</span> <input type="text" name="A" placeholder="A" data-bind="visible:isdna"><input type="text" name="C" placeholder="C" data-bind="visible:isdna"><input type="text" name="G" placeholder="G" data-bind="visible:isdna"><input type="text" name="T" placeholder="T" data-bind="visible:isdna"></form>');
		optdiv.append(optform);
		var alignbtn = $('<a class="button">Start alignment</a>');
		alignbtn.click(function(){
			var formel = optform[0];
			var optdata = new FormData(formel);
			optdata.append('action','startalign');
			optdata.append('fasta',parseexport('fasta'));
			if(treedata.newick && !formel['newtree']['checked']){ optdata.append('newick',parseexport('newick')); }
			$.ajax({
        			url: 'backend.php',
        			type: 'POST',
        			dataType: 'text',
        			xhr: function() {
            			myXhr = $.ajaxSettings.xhr();
            			if(myXhr.upload){ //handling fileupload progress
                			//myXhr.upload.addEventListener('progress',uploadprogress, false);
            			}
            			return myXhr;
        			},
        			beforeSend: function(){
        				alignbtn.html('Sending job');
        				alignbtn.css({'opacity':0.6,'cursor':'default'});
        				alignbtn.unbind('click');
        			},
        			success: function(data){  //job sent to server. Show status.
        				optdiv.slideUp();
        				var job = $.parseJSON(data);
        				//model.jobstatus(job.id,job);
        				optdiv.empty().append('<b>Alignment job started</b><br>');
        				optdiv.next().after('<span class="note">You can close this window and access status via toolbar.</span>');
        				optdiv.append('<div>ID: '+job.id+'</div>');
        				//ko.applyBindings(model,optdiv[0]);
        				optdiv.slideDown();
        				setTimeout(function(){
        					opttitle.html('<img class="icn" src="img/info.png"> Status of alignment job');
        					opttitle.css('cursor','default');
        					alignbtn.html('OK');
        					alignbtn.css({'opacity':1,'cursor':'pointer'});
        					alignbtn.unbind('click').click(function(){ 
        						$(this).closest("div.popupwindow").find("img.closebtn").click();
        					});
        					communicate('alignstatus','','jobdata');
        				},500);
        			},
        			trycount: 0,
        			error: function(xhrobj,status,msg){
        				if(!msg&&status!="abort"){//no response. try again
        					if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        					else{ msg = 'No response from server' }
        				}
        				alignbtn.html('Server error <img src="img/help.png" title="'+msg+'" class="icn">');
        				console.log('Alignment job error: '+status+'|'+msg);
        				if(xhrobj.responseText){ console.log(xhrobj.responseText); }
        			},
        			data: optdata,
        			cache: false,
        			contentType: false,
        			processData: false
    			});
		});
		var dialogdiv = makewindow("Make alignment",['Currently imported data will be aligned with <a href="http://www.ebi.ac.uk/goldman-srv/prank" target="_blank">PRANK</a> aligner.<br><hr>',opttitle,optdiv,'<br>'],{btn:alignbtn});
		ko.applyBindings(model,dialogdiv[0]);
	}
	else if(type=='jobstatus'){
		if($("#jobstatus").length>0) return;
		//var contentdiv = $('<div class="insidediv" data-bind="html:Object.keys(statushtml()).map(function(x){return statushtml()[x];}).join(\'<hr>\')"></div>');
		var contentdiv = $('<div class="insidediv" data-bind="foreach:serverdata.jobdata"><div style="position:relative;min-width:310px"><span class="note">Status: <span data-bind="text:status"></span></span><br><span class="note">Running time: <span data-bind="text:starttime"></span></span><br><span class="note">File directory:</span> <span data-bind="text:id"></span><br><span class="note">Feedback <img src="img/file.png" class="icn" style="cursor:pointer;" onclick="showlog(this,logfile)" data-bind="attr:{title:\'Last update\'+starttime+\'. Click for full log.\'}">:</span><span class="logline" data-bind="text:log"></span></div></div>');
		var jobstatusdiv = makewindow("Status overview",["<b>Status of started alignment jobs</b>",contentdiv,'<br>'],{id:"jobstatus"});
		ko.applyBindings(model,contentdiv[0]);
	}
}

function updatestatus(jobid){
	var qdata = new FormData();
	qdata.append('action','alignstatus');
	qdata.append('jobid',jobid);
	$.ajax({
		url: 'backend.php',
        type: 'POST',
        dataType: 'text',
        success: function(data){  //job sent to server. Show status.
        	var job = $.parseJSON(data);
        	model.jobstatus(jobid,job);
        	if(job.status=='running') setTimeout(function(){updatestatus(jobid)},1000);
        },
        trycount: 0,
        error: function(xhrobj,status,msg){
        	if(!msg){//no response. try again
        		if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        		else{ msg = 'No response from server' }
        	}
        	console.log('Alignment job status update error: '+status+'|'+msg);
        	if(xhrobj.responseText){ console.log(xhrobj.responseText); }
        },
        data: qdata,
        cache: false,
        contentType: false,
        processData: false
    });
}

var ajaxcalls = [];
var acceptedtypes = ['xml','tre','fa','nex','nx','newick','nwk','ph','aln'];
function readfiles(filearr,infodiv,action){ //(array[{name,..}],jQObj,string)||(array[fileurl,..],strig btnid|DOM,'download'|'import')
  if(typeof(filearr[0])=='object'){ //files from filebrowser input
	var list = $("<ul>");
	filetypes = {};
	var haserrors = false;
	var errors = [];
	filescontent = {};
	var tickimg = $('<img class="icn" src="img/tick.png">'); //preload status icons
	var spinimg = $('<img class="icn" src="img/spinner.gif">');
	$.each(filearr,function(i,file){
		var iconimg = '';
		var ext = file.name.substr(file.name.lastIndexOf('.'));
		var accepted = false
		$.each(acceptedtypes,function(j,goodext){ //check if filetype accepted
			if(ext.indexOf(goodext)!=-1){
				if(!filetypes[goodext]){
		 			filetypes[goodext] = [i]; //mark the first position of the filetype
					filearr[i].error = 'OK';
				}
				else{ //multiple files with same type
					filearr[i].error = 1;
					filetypes[goodext].push(i);
					iconimg = '<img src="img/warning.png" title="Can\'t import multiple .'+goodext+' files">';
					haserrors = true;
				}
				accepted = true;
				return false;
			}
		});
		if(!accepted){
			filearr[i].error = 2;
			iconimg = '<img src="img/warning.png" title="Importing '+ext+' files not supported">';
			haserrors = true;
		}
		var iconspan = '<span class="icon">'+iconimg+'</span>';
		var filesize = file.size ? '('+numbertosize(file.size,'byte')+')' : '';
		list.append('<li>'+file.name+' '+filesize+' '+iconspan+'</li>');
	});
	if(filetypes.length==1){
		if(filetypes['tre']||filetypes['nwk']||filetypes['newick']){
			var errind = filetypes['tre']||filetypes['nwk']||filetypes['newick'];
			list.find("span.icon")[errind].innerHTML = '<img src="img/warning.png" title="Tree file needs associated sequence data">';
		}
		filearr[errind].error = 3;
		haserrors = true;
	}
	
	var goodfilecount = 0;
	$.each(filearr,function(i,f){if(f.error=='OK'){ goodfilecount++; }});
	if(haserrors){ errors.push('marked files won\'t be imported <br>(hover the icon for details).') }
	if(goodfilecount==0){ errors.push('<br>No files to import. Please check the file selection.') }
	var errnote = haserrors ? '<span class="note"><img src="img/warning.png"> '+errors.join('<br>')+'</span>' : '';
  }else{ //files as array of urls
  	goodfilecount = filearr.length;
  	$.each(filearr,function(u,url){ fname = url.substr(url.lastIndexOf('/')+1); filearr[u] = {error:'OK',url:url,name:fname}; });
  }
  
  if(goodfilecount){
	  if(action=='upload'||action=='download'){ //file upload/download + import
		var uploadbtn = typeof(infodiv)=='string'? $('#'+infodiv) : $('<a class="button">Import file</a>');
    	uploadbtn.click( function(){
    		$.each(filearr,function(i,file){
    		  if(file.error=='OK'){
    		  	var formData = new FormData(); //build form content
    			if(action=='upload'){ formData.append("action","echofile"); formData.append("upfile",file); }
    			else{ formData.append("action","geturl"); formData.append("fileurl",file.url); }  
    			var ajaxcall = $.ajax({
        			url: 'backend.php',
        			type: 'POST',
        			dataType: 'text',
        			xhr: function() {
            			myXhr = $.ajaxSettings.xhr();
            			if(myXhr.upload){ //for handling the progress of the upload
                			//myXhr.upload.addEventListener('progress',uploadprogress, false);
            			}
            			return myXhr;
        			},
        			beforeSend: function(){
        				if(typeof(infodiv)=='object') infodiv.parent().find("span.icon")[i].innerHTML = '<img src="img/spinner.gif" class="icn">';
        				uploadbtn.html('Importing files');
        				uploadbtn.css({'opacity':0.6,'cursor':'default'});
        				uploadbtn.unbind('click');
        			},
        			success: function(data){  //uploaded/downloaded file is sent from backend. Save content.
        				if(typeof(infodiv)=='object') infodiv.parent().find("span.icon")[i].innerHTML = '<img src="img/tick.png" class="icn">';
        				filescontent[file.name] = (data);
        				if(Object.keys(filescontent).length==goodfilecount){//all files have been read in. Go parse.
        					uploadbtn.html('Files imported');
        					ajaxcalls = [];
        					parsefiles(infodiv);
        				} 
        			},
        			trycount : 0,
        			error: function(xhrobj,status,msg){ 
        				if(!msg&&status!="abort"){//no response. try again
        					if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        					else{ msg = 'No response from server' }
        				}
        				uploadbtn.html('Server error <img src="img/help.png" title="'+msg+'" class="icn">');
        				console.log('Upload/download error: '+status+'|'+msg);
        				if(xhrobj.responseText){ console.log(xhrobj.responseText); }
        			},
        			data: formData,
        			cache: false,
        			contentType: false,
        			processData: false
    			});
    			ajaxcalls.push(ajaxcall);
    		  }
    		});//for each file
    	});//btn click
	  }
	  if(action=='import'){ //get files from home server
	  	var uploadbtn = $(infodiv);
	  	uploadbtn.html('Importing files');
        uploadbtn.css({'opacity':0.6,'cursor':'default'});
        uploadbtn.unbind('click');
        filescontent = {};
	  	$.each(filearr,function(i,file){
	  		$.ajax({
				type: "GET",
				url: file.url,
    			dataType: "text",
    			success: function(data){
    				filescontent[file.name] = (data);
        			if(Object.keys(filescontent).length==goodfilecount){//all files have been read in. Go parse.
        				uploadbtn.html('Files imported');
        				parsefiles(uploadbtn);//import files&hide statuswindow
        			}
    			},
    			trycount : 0,
    			error: function(xhrobj,status,msg){ 
        			if(!msg&&status!="abort"){//no response. try again
        				if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        				else{ msg = 'No response from server' }
        			}
        			uploadbtn.html('Server error <img src="img/help.png" title="'+msg+'" class="icn">');
        			console.log('Upload/download error: '+status+'|'+msg);
        			if(xhrobj.responseText){ console.log(xhrobj.responseText); }
        		}
        	});
   		});//for each file
	  }
	  else { //file import with HTML5 local fileread
		var uploadbtn = $('<a class="button">Import</a>');
		uploadbtn.click(function(){
			uploadbtn.html('Importing');
        	uploadbtn.css({'opacity':0.6,'cursor':'default'});
        	uploadbtn.unbind('click');
			$.each(filearr,function(i,file){
    			if(file.error=='OK'){
    				infodiv.parent().find("span.icon")[i].innerHTML = '<img src="img/spinner.gif" class="icn">';
					var reader = new FileReader();  
    				reader.onload = function(evt){
    					filescontent[file.name] = evt.target.result;
    					infodiv.parent().find("span.icon")[i].innerHTML = '<img src="img/tick.png" class="icn">';
    					if(Object.keys(filescontent).length==goodfilecount){ uploadbtn.html('Files imported'); parsefiles(infodiv) }
    				};  
    				reader.readAsText(file);
    			}
    		});
		}) 
	  }
	} else { var uploadbtn = '' }
	
  if(action!='import'){ //files from filebrowser. Flip the window.
	var backbtn = $('<a class="button" style="padding-left:15px">&#x25C0; Back</a>');
	backbtn.click(function(){
		$.each(ajaxcalls,function(c,call){ if(call.readyState!=4){ call.abort(); }}); //cancel hanging filetransfers
		ajaxcalls = []; $(".popupwrap").removeClass('flipped');
	});
	var remotestr = action=='download' ? ' remote ' : ' ';
	infodiv.empty().append('<b>Selected'+remotestr+'files</b><br>',list,'<br>',errnote,'<br>',backbtn,uploadbtn);
	$(".popupwrap").addClass('flipped');
  }
}

function uploadprogress(e){ //file upload meter
    if(e.lengthComputable){
        //console.log(parseInt((e.loaded/e.total)*100)+'%');
    }
}

$(function(){
	right = $("#right"); //DOM variables for mCustomScrollbar.js
	seqwindow = $("#seqwindow");
	wrap = $("#wrap");
	seq = $("#seq");
	seqwrap = $("#seqwrap");
	ruler = $("#ruler");
	verticalDragger_container = $("#verticalDragger");
	verticalDragger = $("#verticalDragger .dragger");
	scrollUpBtn = $("#verticalDragger .scrollUpBtn");
	scrollDownBtn = $("#verticalDragger .scrollDownBtn");
	horizontalDragger_container = $("#horizontalDragger");
	horizontalDragger = $("#horizontalDragger .dragger");
	scrollLeftBtn = $("#horizontalDragger .scrollLeftBtn");
	scrollRightBtn = $("#horizontalDragger .scrollRightBtn");
	canvasload = $("#canvasload");
	spinner = $("#spinner");
	treewrap = $("#treewrap");
	 
	spinner.css({'display':'block','opacity':1});
	
	ko.applyBindings(model);
	
	$("#zoombtns").hover(function(){$("#zoomperc").fadeIn()},function(){$("#zoomperc").fadeOut()});
	
	var $left = $("#left");
	var $border = $("#leftborder");
	var $right = $("#right");
	$("#borderDrag").draggable({ //make tree width resizable
		axis: "x", 
		containment: [50,0,500,0],
		drag: function(event, dragger) {
			$left.css('width',dragger.offset.left);
			$right.css('left',dragger.offset.left+10);
			//$(window).trigger('resize');
		},
		stop: function(){
			$(window).trigger('resize');
		}
	});
	$("#namesborderDrag").draggable({ //make names width resizable
		axis: "x", 
		containment: 'parent',
		drag: function(event, dragger) {
			$("#tree").css('right',133-dragger.position.left);
			$("#names").css('width',133-dragger.position.left);
		}
	});
	$("#namesborderDrag").hover(
		function(){$("#names").css('border-color','#aaa')},
		function(){$("#names").css('border-color','white')}
	);
	
	seqwindow.mousedown(function(e){
	 e.preventDefault();//disable image drag etc.
	 var startpos = {x:e.pageX,y:e.pageY};
	 if(e.pageY>seqwindow.offset().top+30){//in seq area
	  if(e.which==1 && e.target.tagName!='DIV'){//act on left mouse button, outside of selections
		var curid = lastselectionid;
		seqwindow.mousemove(function(evt){ selectionsize(evt,curid,startpos); });
		seqwindow.mouseup(function(e){
	 		if(e.pageY>seqwindow.offset().top+30){//in seq area
	  			if(e.which==1 && e.target.tagName!='DIV' && $("div.canvasmenu").length==0){ //outside of selections
	  				var dx = e.pageX-startpos.x; var dy = e.pageY-startpos.y; 
	  				if(Math.sqrt(dx*dx+dy*dy)<10) tooltip(e,'',seqinfo(e)); //no drag
	  			}
	 		}
	 		seqwindow.unbind('mouseup');
		});
	  }
	 }
	});
	
	$("html").mouseup(function(){ seqwindow.unbind('mousemove'); });
	
	seqwindow.bind('contextmenu',function(e){//right click
		e.preventDefault();//disable right-click menu
		hidetooltip();
		if($('div[id^="selection"]').length==0){//no selections made
			tooltip(e,'','Drag to make a selection');
		}
		else {
	  	  var data = {};
	  	  var mode = model.selmode();
	  	  var over = e.target.id=='' ? e.target.parentNode : e.target;	
	  	  activeid = over.id.indexOf('selection')!=-1||over.id.indexOf('cross')!=-1 ? over.id.substr(9) : false;
	  	  var curactiveid = activeid;
	  	  
	  	  if(mode=='default'||mode=='columns'){//construct right-click dropmenus for sequence area
	  	  	var maskcount = 0;
			for(var c=0;c<maskedcols.length;c++){ if(maskedcols[c]){ maskcount++; } }
	  		data['\u25A5 Mask columns'] = { 'click':function(){ maskdata(false,false,'maskcols') }, 'submenu':{} };
	  		if(activeid){ 
	  			data['\u25A5 Mask columns']['submenu']['<span style="color:orange" title="Mask alignment columns under active (orange-bordered) selection area.">\u25A5</span> Mask these columns'] = { 'click' : function(e){ maskdata(e,curactiveid,'maskcols') } };
	  			data['\u25A5 Mask columns']['submenu']['<span style="color:orange" title="Unmask alignment columns under active (orange-bordered) selection area.">\u25A5</span> Unmask these columns'] = { 'click' : function(e){ maskdata(e,curactiveid,'unmaskcols') },
	  			'submenu':  {'\u25A5 Unmask columns':{ 'click':function(e){ maskdata(e,false,'unmaskcols') } } } };
				data['\u25A5 Mask columns']['submenu']['<span style="color:orange" title="Collapse alignment columns under active (orange-bordered) selection area.">\u2226</span> Hide these columns'] = { 'click' : function(e){ hidecolumns(e,curactiveid) },
				'submenu': {'\u2226 Hide columns':{ 'click':function(e){ hidecolumns(e) } } } };
				if(maskcount!=0){ 
					data['\u25A5 Mask columns']['submenu']['<span style="color:orange" title="Collapse alignment columns under active (orange-bordered) selection area.">\u2226</span> Hide these columns']['submenu']['<span title="Collapse '+maskcount+' masked columns.">\u2226</span> Hide masked columns'] = { 'click' : function(e){ maskdata(e,false,'hidemaskedcols') }};
				}
			}else{
				data['\u25A5 Mask columns']['submenu']['\u25A5 Unmask columns'] = { 'click' : function(e){ maskdata(e,false,'unmaskcols') } };
				data['\u25A5 Mask columns']['submenu']['\u2226 Hide columns'] = { 'click' : function(e){ hidecolumns(e) } };
				if(maskcount!=0){ 
					data['\u25A5 Mask columns']['submenu']['<span title="Collapse '+maskcount+' masked columns.">\u2226</span> Hide masked columns'] = { 'click' : function(e){ maskdata(e,false,'hidemaskedcols') }};
				}
			}
	  	  }
	  	  
	  	  if(mode=='default'||mode=='rows'){		
	  		data['\u25A4 Mask rows'] = { 'click':function(){ maskdata(false,false,'maskrows') }, 'submenu':{} };
	  		if(activeid){ 
	  			data['\u25A4 Mask rows']['submenu']['<span style="color:orange" title="Mask sequence rows under active (orange-bordered) selection area.">\u25A4</span> Mask these rows'] = { 'click':function(e){ maskdata(e,curactiveid,'maskrows') } };
	  			data['\u25A4 Mask rows']['submenu']['<span style="color:orange" title="Unmask sequence rows under active (orange-bordered) selection area.">\u25A4</span> Unmask these rows'] = { 'click':function(e){ maskdata(e,curactiveid,'unmaskrows') }, 
	  			'submenu': {'\u25A4 Unmask rows':{ 'click':function(e){ maskdata(e,false,'unmaskrows') } } } }; 
	  			if(model.treesource()){ data['\u25A4 Mask rows']['submenu']['<span style="color:orange" title="Collapse sequence rows under active (orange-bordered) selection area.">\u2262</span> Hide these rows'] = { 'click':function(e){ togglerows(e,curactiveid,'selection'); }, 
	  			'submenu': {'\u2262 Hide rows':{ 'click':function(e){ togglerows(e,false,'selection'); } } } }; }//if has tree
	  		}else{
	  			data['\u25A4 Mask rows']['submenu']['\u25A4 Unmask rows'] = { 'click':function(e){ maskdata(e,false,'unmaskrows') } };
	  			if(model.treesource()){ data['\u25A4 Mask rows']['submenu']['\u2262 Hide rows'] = { 'click':function(e){ togglerows(e,false,'selection'); } }; }//if has tree
	  		}
	  	  }
	  			
	  	  if(mode=='default'){ 
	  		data['\u25A5 Mask columns']['mouseover'] = function(){ toggleselection('show columns') };
	  		data['\u25A4 Mask rows']['mouseover'] = function(){ toggleselection('show rows') }; 
	  		data['\u25A5 Mask columns']['mouseout'] = function(){ toggleselection('hide columns') };
	  		data['\u25A4 Mask rows']['mouseout'] = function(){ toggleselection('hide rows') };
	  	  }
		  
	  	  if(activeid){//right-click on selection
	  		$('#selection'+activeid+',#vertcross'+activeid+',#horicross'+activeid).css({'border-color':'orange','color':'orange'});
	  		if(over.id.indexOf('selection')!=-1){
	  			data['<span style="color:orange">\u25A6</span> Mask selection area'] = { 'click':function(){ maskdata(false,activeid,'maskselection') },
	  				'submenu':{ '<span style="color:orange">\u25FB</span> Unmask selection area':{ 'click':function(e){ maskdata(e,activeid,'unmaskselection') } }, 
	  						    '\u259A Mask all selections':{ 'click':function(e){ maskdata(e,false,'maskselection') } }}
	  			};
	  		} else { data['\u259A Mask all selections'] = function(){ maskdata(false,false,'maskselection') }}
	  		data['<span style="color:orange">\u2327</span> Clear this selection'] = {'click':function(){ clearselection(activeid); },
	  			'submenu':{ '\u2573 Clear all selections':{ 'click':function(e){ e.stopPropagation(); hidetooltip(); clearselection(); } }}
	  		};
	  	  } else {
	  	  	data['\u259A Mask all selections'] = function(){ maskdata(false,false,'maskselection') }; 
	  	  	data['\u2573 Clear all selections'] = function(){ clearselection(); }; 
	  	  }
	  	  tooltip(e,'','','',data);
	   }
	});
	
	
	$.ajax({ //get initial datafile
		type: "GET",
		url: "data/mindata.xml",
    	dataType: "text",
    	success: function(data){
    		filescontent = {};
    		filescontent["testdata.xml"] = data;
    		parsefiles();
    	}
	});
	
	communicate('alignstatus','','jobdata'); //get&save status of running jobs
});