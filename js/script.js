//Web app for handling multiple alignment data from PRANK. 
//Author: Andres Veidenberg. Created Nov. 2011

//var start,now,end = new Date().getTime();

var sequences = {};
var treedata = {};
var treesvg = {};
var names = {};
var leafnodes = {};
var colstep = 200;
var rowstep = 60;
var letters = '-_.:?!*=AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz'.split('');
var alphabet = { 'residues': ['A','R','N','D','C','Q','E','G','H','I','L','K','M','F','P','S','T','W','Y','V','B','Z','X','-','?','*'],
'dna': ['A','T','G','C','N','X','-','?'], 'rna': ['A','G','C','U','N','X','-','?']};
var colors = {};
var symbols = {};
var canvassymbols = {'_':'-','.':'+',':':'+','!':'?','=':'*'}; //canvas masks
var canvaslabels = {'-':'gap','_':'gap','.':'ins.',':':'ins.','?':'unkn.','!':'unkn.','*':'stop','=':'stop'};
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
var exportedseq = '';
var exportedtree = '';
var jobdataopt = {
	key: function(item){ return ko.utils.unwrapObservable(item.id); },
	create: function(args){ return new jobmodel(args.data); }
};
var analysdataopt = {
	key: function(item){ return ko.utils.unwrapObservable(item.id); },
	create: function(args){ return new analysmodel(args.data); }
};
var serverdata = {'jobdata':ko.mapping.fromJS([],jobdataopt),'analysdata':ko.mapping.fromJS([],analysdataopt)};

var is = { //browser detection
	ff : Boolean($.browser.mozilla),
	chrome: Boolean(window.chrome),
	safari: Boolean($.browser.webkit && !Boolean(window.chrome))
}
var dom = {};

/* KnockOut data models to keep the state of the system */
var myModel = function(){ //main viewmodel
	var self = this;
	//rendering parameters
	self.startfile = "mindata.xml";
	self.zoomlevel = ko.observable(10);
	self.zoomperc = ko.computed(function(){ var l = self.zoomlevel(); return l==2 ? 'MIN' : l==20 ? 'MAX' : l*5+'%'; });
	self.boxw = ko.computed(function(){ return parseInt(self.zoomlevel()*1.5); });
	self.boxh = ko.computed(function(){ return parseInt(self.zoomlevel()*2); });
	self.fontsize = ko.computed(function(){ return parseInt(self.zoomlevel()*1.8); });
	self.nameswidth = ko.observable(50);
	self.namesw = ko.computed(function(){ return self.nameswidth()+'px'; });
	self.dendogram = ko.observable(false);
	//button states
	self.selmode = ko.observable('default');
	self.selmodes = [{mode:'default',icon:'\u25FB'},{mode:'columns',icon:'\u25A5'},{mode:'rows',icon:'\u25A4'}];
	self.selclass = ko.computed(function(){ return 'button '+self.selmode(); });
	self.setmode = function(data){ self.selmode(data.mode); togglemenu('selectmodemenu','hide'); toggleselection(data.mode); };
	self.filemenu = ['library','import','export','info'];
	self.fileclick = function(data){ dialog(data); togglemenu('filemenu','hide'); };
	self.runmenu = [{n:'Make alignment',c:'align'},{n:'Make guidetree',c:'tree'},{n:'Compact columns',c:'compact'},{n:'Test alginment',c:'test'}];
	self.runclick = function(data){ dialog(data.c); togglemenu('runmenu','hide'); };
	//current data
	self.currentid = ko.observable('');
	self.parentid = ko.computed(function(){
		var idend = self.currentid().lastIndexOf('/children/');
		if(idend!=-1) return self.currentid().substring(0,idend);
		else return '';
	});
	self.libdir = ko.observable('Main directory');
	self.seqtype = ko.observable('residues');
	self.colorscheme = ko.observable('taylor');
	self.seqtype.subscribe(function(v){
		var val = v=='dna'||v=='rna' ? 'dna':'taylor';
		self.colorscheme(val);
		if(val=='dna'){ self.gaprate(0.025); self.gapext(0.75); self.isdna(true); }
		else{ self.gaprate(0.005); self.gapext(0.5); self.isdna(false); }
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
	//alignment parameteres (alignment window)
	self.gaprate = ko.observable(0.005);
	self.gapext = ko.observable(0.5);
	//alignment jobs tracking (status window)
	self.sortjobsby = ko.observable('starttime');
	self.sortedjobs = ko.computed(function(){ return sortdata('jobdata',self.sortjobsby()); }).extend({throttle:100});
	self.jobtimeout = '';
	//notifications
	self.treealtered = ko.observable(false);
	self.statusbtn = ko.computed(function(){
		var str = '';
		if(self.treealtered()){
			str = '<span style="color:red">Realign needed</span>';
		}
		
		var running=0,ready=0;
		$.each(self.sortedjobs(),function(i,job){
			if(job.status()=='running') running++;
			else if(!job.imported()) ready++;
		});
		var total = running+ready;
		var counticons = ['&#x24FF;','&#x2776;','&#x2777;','&#x2778;','&#x2779;','&#x277A;','&#x277B;','&#x277C;','&#x277D;','&#x277E;','&#x277F;','&#x24EB;','&#x24EC;','&#x24ED;','&#x24EE;','&#x24EF;','&#x24F0;','&#x24F1;','&#x24F2;','&#x24F3;','&#x24F4;'];
		if(total>0){
			if(str != ''){
				str += '<span class="btnsection">'+(counticons[total]||total)+'<span>';
			}
			else{
				str = 'Jobs ';
				if(running > 0) str += 'running '+(counticons[running]||running);
				if(ready > 0) str += 'ready '+(counticons[ready]||ready);
			}
			if(running > 0){
				if(self.jobtimeout) clearTimeout(self.jobtimeout);
				self.jobtimeout = setTimeout(function(){ communicate('alignstatus','','jobdata'); },1000); //update data in 1s
			}
		}
		if(self.sortedjobs().length==0&&!self.treealtered()&&$("#jobstatus").length!=0){ setTimeout(function(){ $("#jobstatus img.closebtn").click(); },1000); } //close empty status window
		return str;
	}).extend({throttle: 200});
	//imported alignments list (library window)
	self.sortanalysopt = [{t:'Name',v:'name'},{t:'Analysis ID',v:'id'},{t:'Start date',v:'starttime'},{t:'Last opened',v:'imported'},{t:'Last saved',v:'savetime'}];
	self.sortanalysby = ko.observable('starttime');
	self.sortedanalys = ko.computed(function(){ return sortdata('analysdata',self.sortanalysby()); }).extend({throttle:100});
	self.additem = function(div){ if($(div).hasClass('itemdiv')) $(div).hide().fadeIn(800); };
	self.removeitem = function(div){ $(div).remove(); };
	//undo stack
	self.undostack = ko.observableArray();
	self.activeundo = ko.observable(''); //{name:'',type:'',data:{},undone:false}
	self.undoname = ko.computed(function(){
		if(!self.activeundo() && self.undostack().length>0) self.activeundo(self.undostack()[0]);
		var name = self.activeundo()?self.activeundo().name:'History';
		if(name.length>7) name = name.substr(0,6)+'..';
		return name;
	});
	self.treesnapshot = '';
	self.selectundo = function(data){
		if(data==='firsttree') data = self.gettreeundo('first');
		self.activeundo(data);
		togglemenu('undomenu','hide');
	};
	self.addundo = function(undodata){
		undodata.undone = false;
		if(undodata.type=='tree'&&undodata.info.indexOf('subsequent')==-1) undodata.info += ' Undo will also revert any subsequent tree modifications.';
		self.undostack.unshift(undodata);
		self.activeundo(undodata);
	};
	self.undo = function(){
		var data = self.activeundo();
		if(data.undone) return;
		if(data.type=='tree'){
			var undoindex = self.undostack.indexOf(data);
			var restore = data===self.gettreeundo('first')? self.treesnapshot : (self.gettreeundo('prev',undoindex).data || self.treesnapshot);
			treesvg.loaddata(restore);
			self.gettreeundo('remove',undoindex);
			if(restore == self.treesnapshot) self.treealtered(false);
		}
		self.undostack.remove(data);
		data.undone = true;
	};
	self.redo = function(){
		var data = self.activeundo();
		if(!data.undone) return;
		if(data.type=='tree'){
			treesvg.loaddata(data.data);
			if(data.data != self.treesnapshot) self.treealtered(true);
		}
		self.addundo(data);
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

//model for file exporting (export window)
var myExport = function(){
	var self = this;
	self.categories = [
		{name:'Sequence', formats:[{name:'fasta', variants:[{name:'fasta', ext:['.fa']} ]} ]}, 
		{name:'Tree', formats:[ 
			{name:'newick', variants:[
				{name:'newick', ext:['.nwk','.tre','.tree']},
				{name:'extended newick', ext:['.nhx'], desc:'Newick format with additional metadata (hidden nodes etc.)'}
			]} 
		]}
	];
	//{name:'Phylip',fileext:'.phy',desc:'',interlace:true}, {name:'PAML',fileext:'.phy',desc:'Phylip format optimized for PAML',hastree:false,interlace:false}, {name:'RAxML',fileext:'.phy',desc:'Phylip format optimized for RAxML',hastree:false,interlace:false};
	self.category = ko.observable({});
	self.format = ko.observable({});
	self.variant = ko.observable({});
	self.filename = ko.observable('exported_data');
	self.fileext = ko.observable('.fa');
	self.fileurl = ko.observable('');
	self.incltree = ko.observable(false);
	self.inclancestral = ko.observable(false);
	self.inclhidden = ko.observable(true);
	self.interlaced = ko.observable(false);
	self.maskoptions = ['lowercase','N','X'];
	self.masksymbol = ko.observable('lowercase');
}

//HTML element transitions when viewmodel data changes
ko.bindingHandlers.fadevisible = {
	init: function(element){ $(element).css('display','none') },
    update: function(element, value){
        var value = ko.utils.unwrapObservable(value());
        if(value) $(element).fadeIn(); else $(element).fadeOut();
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

//viewmodels initiation
var model = new myModel();
var exportmodel = new myExport();

//HTML rendering for running jobs (jobstatus window)
var jobmodel = function(data){
	ko.mapping.fromJS(data, {}, this);
	var btnhtml = function(action,name,style,title,sclass){ return '<a class="button itembtn '+(sclass||'')+'" style="'+(style||'')+'" title="'+(title||'')+'" onclick="'+action+'">'+name+'</a>'; };
	
	this.html = ko.computed(function() {
		var idindex = this.id().lastIndexOf('/');
		var shortid = idindex!=-1? this.id().substring(idindex+1) : this.id(); 
    	if(this.imported()){ return 'Files of job '+shortid+'<br>have been imported. '+btnhtml('dialog(\'library\')','Library','top:3px'); }
        var status = this.status();
        var btn = '';
		if(status!='running'){
			if(status=='0' && this.outfile()){
				var outfiles = this.outfile().split(',').join('\',\'');
				status = 'ready to import';
				btn = btnhtml('readfiles([\''+outfiles+'\'],this,\'import:'+this.id()+'\')','Open','','Open '+outfiles);
			}else{
				var err = ((status!='0')?'Exit code '+status+'. ':'')+((!this.outfile())?'No result file. ':'')+' Check log for details.';
				status = '<span style="color:red">Failed. </span><img class="icn" src="img/help.png" title="'+err+'"> ';
				btn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','color:red','Delete data of job '+shortid,'removebtn');
				if(this.parameters().indexOf('-updated')!=-1) model.treealtered(true); //realignment failed: revert status
			}
		}
		else{ btn = btnhtml('dialog(\'terminate\',{id:\''+this.id()+'\',btn:this})','Kill','color:red','Terminate job '+shortid,'removebtn'); }
		var now = new Date().getTime();
		var endtime = status=='running' ? now/1000 : parseInt(this.lasttime());
		var runningtime = numbertosize(endtime-parseInt(this.starttime()),'sec');
		var lastdate = msectodate(this.lasttime());
		var logline = this.log()? this.log() : 'Process finished '+lastdate;
		return  '<span class="note">Name:</span> <span class="logline">'+this.name()+'<span class="fade"></span></span><br><span class="note">Status:</span> '+status+'<br><span class="note">Running time:</span> '+runningtime+btn+'<br><span class="note">Started:</span> '+msectodate(this.starttime())+'<br><span class="note">Job ID:</span> <span title="Folder path: '+this.id()+'">'+shortid+'</span><br><span class="note">Feedback:</span> <span class="logline actiontxt" onclick="showfile(this,\''+this.logfile()+'\')" title="Last update '+lastdate+'. Click for full log.">'+logline+'<span class="fade"></span></span>';
    }, this);
}

//HTML rendering for imported jobs (library window)
var analysmodel = function(data){
	ko.mapping.fromJS(data, {}, this);
	var btnhtml = function(action,name,style,title,sclass){ return '<a class="button itembtn '+(sclass||'')+'" style="'+(style||'')+'" title="'+(title||'')+'" onclick="'+action+'">'+name+'</a>'; };
	this.divh = '55px';
	
    this.html = ko.computed(function(){
    	var imported = this.hasOwnProperty('imported')? msectodate(this.imported()) : 'Never';
    	var saved = this.hasOwnProperty('savetime')? msectodate(this.savetime()) : 'Never';
    	this.isactive = false;
    	if(this.hasOwnProperty('outfile') && this.outfile()){
    		var ofiles = this.outfile().split(',').join('\',\'');
    		if (typeof(model)!='undefined' && this.id() == model.currentid()){ 
    			var btnname = 'Restore';
    			var btntitle = 'Revert back to saved state';
    			this.isactive = true;
    		}else{
    			var btnname = 'Open';
    			var btntitle = 'Open '+this.outfile();
    		}
    		var itembtn = btnhtml('readfiles([\''+ofiles+'\'],this,\'import:'+this.id()+'\')',btnname,'',btntitle);
    		var removebtn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','','Delete folder '+this.id(),'removebtn');
    	}
    	else{ //no output files specified in metadata
    		var itembtn = btnhtml('dialog(\'removeitem\',{id:\''+this.id()+'\',btn:this})','Delete','color:red','Delete folder '+this.id());
    		var removebtn = '';
    		imported += ' (broken)';
    	}
    	if(this.hasOwnProperty('children')&&this.children()>0){
    		var actclass = model.currentid()!=this.id()&&model.currentid().indexOf(this.id())!=-1? ' activeitem' : ''; //child open > color btn white
    		var childbtn = btnhtml('communicate(\'getmeta\',{parentid:\''+this.id()+'\'},\'analysdata\')','<span class="svg">'+svgicon('children')+'</span> '+this.children(),'','View subanalyses','childbtn'+actclass);
    	} else var childbtn = '';
    	var alignerdata = this.aligner().split(':');
    	var idend = this.id().lastIndexOf('/');
		var folderid = idend!=-1? this.id().substring(idend+1) : this.id();
		return '<div><span class="note">Name:</span> <input type="text" class="hidden" onblur="communicate(\'writemeta\',{id:\''+this.id()+'\',key:\'name\',value:this.value})" value="'+this.name()+'" title="Click to edit"><br><span class="note">Last opened:</span> '+imported+'<br><span class="note">File directory:</span> <span class="actiontxt" title="Toggle folder content" onclick="showfile(this,\''+this.id()+'\')">'+folderid+'</span><br>'+itembtn+'<span class="note">Started:</span> '+msectodate(this.starttime())+'<br><span class="note">Last saved:</span> '+saved+'<br><span class="note">Aligner:</span> <span class="label" title="Executable: '+alignerdata[1]+'">'+alignerdata[0]+'</span><br><span class="note">Parameters:</span> <span class="logline label" style="cursor:text" title="'+this.parameters()+'">'+this.parameters()+'<span class="fade"></span></span>'+childbtn+removebtn+'<span class="actiontxt itemexpand" onclick="toggleitem(this,\''+this.divh+'\')" title="Toggle additional info">&#x25BC;</span></div>';
    }, this);
}

function toggleitem(btn,starth){ //expand/contract job divs (library window)
	var itemdiv = $(btn).closest('div.itemdiv');
	if(btn.innerHTML == '\u25BC'){ //expand itemdiv
		itemdiv.css('height',itemdiv.children().first().height()+12+'px');
		setTimeout(function(){btn.innerHTML = '\u25B2';},400);
	}
	else{ //contract
		itemdiv.css('height',starth);
		setTimeout(function(){btn.innerHTML = '\u25BC';},400);
	}
}

function showfile(btn,file){ //show file/folder content from server (library window)
	var logdiv = $(btn).closest('div.itemdiv').next('div.logdiv');
	if(logdiv.length==0){ //logdiv not yet created
		logdiv = $('<div class="insidediv logdiv">');
		$(btn).closest('div.itemdiv').after(logdiv);
	}
	else if(logdiv.css('display')!='none'){
		logdiv.slideUp(200);
		return;
	}
	if(file.indexOf('.')!=-1){ //file
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
    	communicate('getdir',{dir:'analyses/'+file},{func: function(data){
    		filearr = data.split('|');
    		str = '';
    		$.each(filearr,function(i,f){ fdata = f.split(':'); str += fdata[0]+' ('+numbertosize(fdata[1],'byte')+')<br>'; });
    		logdiv.html(str);
    		logdiv.slideDown(); 
    	}});
    }
}


function communicate(action,senddata,options){ //send and receive+save data from server (to data model)   fn(str,obj,[str|obj])
	if(!action) return;
	var formdata = new FormData();
	formdata.append('action',action);
	if(action=='getmeta'){
		if(!senddata.parentid&&model.parentid()) senddata = {parentid:model.parentid()};
		else if(senddata.parentid=='main') senddata = '';
	}
	if(senddata) $.each(senddata,function(key,val){ formdata.append(key,val) });
	$.ajax({
		type: "POST",
		url: 'backend.php',
    	success: function(data){
    		var endfunc = action=='writemeta'? function(){
    			var idend = senddata.id.lastIndexOf('/children/');
				var parentdir = idend!=-1? {parentid: senddata.id.substring(0,idend)} : {parentid: 'main'};
    			communicate('getmeta',parentdir,'analysdata'); } : '';
    			
    		if(typeof(options)=='string'){ //save response data to 'serverdata' array
    			var saveto = options;
    			if(typeof(serverdata[saveto])=='undefined'){
    				serverdata[saveto] = ko.mapping.fromJS(data,{key:function(item){ return ko.utils.unwrapObservable(item.id); }});
    			}
    			else{ ko.mapping.fromJSON(data,{},serverdata[saveto]);  }
    		}
    		else if(typeof(options)=='object'){
    			if(options.hasOwnProperty('btn')){
    				try{ data = JSON.parse(data); } catch(e){ data = data.replace(/^'|'$/g, "") } //catch json parse error
    				if(typeof(data)=='string') options.btn.innerHTML = data;
    				else if(data.file) options.btn.href = data.file;
    				if($(options.btn).css('opacity')==0) $(options.btn).css('opacity',1);
    			}
    			if(options.hasOwnProperty('func')){ endfunc = function(){ options.func(data) }; }
    		}
    		else if(typeof(options)=='function'){ //save response data to ko.observable
    			options(data);
    		}
    		
    		if(action=='getmeta'){
    			if(senddata.parentid){
    				var dirtrail = senddata.parentid.replace(/\/children\//g,' &#x25B8; ');
    				var idend = senddata.parentid.lastIndexOf('/children/');
					var parentdir = idend!=-1? '{parentid:\''+senddata.parentid.substring(0,idend)+'\'}':'{parentid:\'main\'}';
    				model.libdir('Main &#x25B8; '+dirtrail+' <br><a class="button small square" onclick="communicate(\'getmeta\','+parentdir+',\'analysdata\')">&#x25C1; Parent </a>');
    			}
    			else model.libdir('Main directory');
    		}
    		if(endfunc){ setTimeout(endfunc,500); } //refresh local data
    	},
    	error: function(xhrobj,status,msg){
    		if(typeof(saveto)=='object' && saveto.hasOwnProperty('btn')){ saveto.btn.innerHTML = 'Failed'; }
    		if(options.btn) setTimeout(function(){ communicate('alignstatus','','jobdata'); communicate('getmeta',{parentid:senddata.parentid},'analysdata'); }, 500);
    	},
    	data: formdata,
    	dataType: "text",
        cache: false,
        contentType: false,
        processData: false
    });
}


function togglemenu(id,action,data){ //show/hide dropdown menus
	var menudiv = $('#'+id);
	if(typeof(action)=='undefined' || action==''){ var action = menudiv.parent().css('display')=='none' ? 'show' : 'hide'; }
	if(action=='show'){
		menudiv.parent().css('display','block');
		if(menudiv.height()==0){ menudiv.parent().css('display','none'); return; }
		setTimeout(function(){ menudiv.css('margin-top','-1px') },50);
	}
	else if (action=='hide'){
		$.each($('div.buttonmenu'),function(){
			var self = $(this);
			self.css('margin-top',0-menudiv.innerHeight()-6+'px');
			setTimeout(function(){ self.parent().css('display','none') },400);
		});
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

function msectodate(sec){
	var t = new Date(parseInt(sec)*1000);
	return ('0'+t.getDate()).slice(-2)+'.'+('0'+(t.getMonth()+1)).slice(-2)+'.'+t.getFullYear().toString().substr(2)+' at '+t.getHours()+':'+('0'+t.getMinutes()).slice(-2);
}

/* Input file parsing */
function parseimport(options){ //options{dialog:jQ,update:true}
	if(!options) options = {};
	var errors = [], notes = [], treeoverwrite = false, seqoverwrite = false;
	var Tidnames = {}, Tsequences = {}, Ttreedata = {}, Ttreesource = '', Tseqsource = '', Tseqformat = '';
	var Ttotalseqcount=0, Tmaxseqlen=0, Talignlen=0, Tminseqlen=0, Tleafcount=0, Tnodecount=0;
	
	var parseseq = function(seqtxt,filename,format,nspecies,nchars){
		if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }
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
   				Tsequences[name] = seqarr; taxanames.push(name); //Tnames[name] = name;
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
   		var name = self.attr("name") ? self.attr("name") : id;
   		if(self.attr("name")){ Tidnames[id] = name; }
   		var tmpseq = self.find("sequence").text();
   		if(tmpseq.length != 0){
   			tmpseq = tmpseq.replace(/\s+/g,'');
   			name = name.replace(/#/g,'');
   			if(Tsequences[name]){ errors.push("Non-unique taxa name found!<br>("+name+")"); }
   			Tsequences[name] = tmpseq.split('');
   		}
   	};
	
	var parsetree = function(treetxt,filename,format){ //import tree data
		if(!$.isEmptyObject(Ttreedata)){ Ttreedata = {}; treeoverwrite = true; }
		Ttreesource = filename;
		if(!format) format = 'newick';
		if(format=='newick'){ //remove whitespace
			if(Tseqformat=='fasta'){ //match fasta name truncating
				//treetxt = treetxt.replace(/(['"]\w+)[^'"]+(['"])/g,"$1$2");
			}
			treetxt = treetxt.replace(/[\n\r#]+/g,'')+';';
		}
		Ttreedata[format] = treetxt;
	};
	
	var filenames = Object.keys(filescontent);
	filenames.sort(function(a,b){ //sort filelist: [nexus,xml,phylip,...,tre]
		if(/\.tre/.test(a)) return 1; else if(/\.tre/.test(b)) return -1;
		return /\.ne?x/.test(a)? -1: /\.xml/.test(a)? /\.ne?x/.test(b)? 1:-1 : /\.ph/.test(a)? /\.ne?x|\.xml/.test(b)? 1:-1 : /\.ne?x|\.xml|\.ph/.test(b)? 1: 0;
	});
	
	$.each(filenames,function(i,filename){
		var file = filescontent[filename];
		if(/^<\w+>/.test(file)){ //xml
			if(file.indexOf("<phyloxml")!=-1){ //phyloxml tree
				parsetree(file,filename,'phyloxml');
			}
			else{  //HSAML
			  var newickdata = $(file).find("newick");
			  if(newickdata.length != 0){ parsetree(newickdata.text(),filename); }
			  var leafdata = $(file).find("leaf");
			  if(leafdata.length != 0){ if(!$.isEmptyObject(Tsequences)){ Tsequences = {}; seqoverwrite = true; }}
			  Tseqsource = filename;
   			  leafdata.each(parsenodeseq);
   			  var nodedata = $(file).find("node");
   			  nodedata.each(parsenodeseq);
   			}
   			if(newickdata.length!=0 && leafdata.length!=0){ return false }//got data, no more files needed
   		}
   		else if(/^>\s?\w+/m.test(file)){ //fasta
   			if(!$.isEmptyObject(Tsequences)){ seqoverwrite = true; }
   			Tseqsource += ' '+filename; Tseqformat = 'fasta';
   			var nameexp = /^> ?(\w+).*$/mg;
   			var result = [];
   			while(result = nameexp.exec(file)){ //find nametags from fasta
   				var to = file.indexOf(">",nameexp.lastIndex);
   				if(to==-1){ to = file.length; }
   				var tmpseq = file.substring(nameexp.lastIndex,to); //get text between fasta tags
   				tmpseq = tmpseq.replace(/\s+/g,''); //remove whitespace
   				var name = result[1];
   				if(Tsequences[name]){ errors.push("Non-unique taxa name found!<br>("+name+")"); break; }
   				Tsequences[name] = tmpseq.split('');
   				//Tnames[name] = name;
   			}
   		}
   		else if(/^clustal/i.test(file)){ //Clustal
   			file = file.substring(file.search(/[\n\r]+/)); //remove first line
   			parseseq(file,filename,'clustal');
   		}
   		else if(narr = file.match(/^\s*(\d+) {1}(\d+) *[\n\r]/)){ //phylip alignment
   			file = file.substring(file.search(/[\n\r]/)); //remove first line
   			parseseq(file,filename,'phylip',narr[1],narr[2]);
   		}
   		else if(file.indexOf("#NEXUS")!=-1){ //NEXUS
   			var blockexp = /begin (\w+);/igm;
   			var result = '', hastree=false, hasseq=false;
   			while(result = blockexp.exec(file)){ //parse data blocks
   				var blockname = result[1].toLowerCase();
   				if(blockname=='trees'||blockname=='data'||blockname=='characters'){
   					if(blockname=='trees'){
   						var blockstart = file.indexOf('(',blockexp.lastIndex);
   						var blockend = file.indexOf(';',blockstart);
   						var blocktxt = file.substring(blockstart,blockend);
   						parsetree(blocktxt,filename);
   						hastree = true;
   					}
   					else if(blockname=='data'||blockname=='characters'){
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
   			if(hastree&&hasseq){ return false } //got tree+seq: break
   		}
   		else if(/^\s?\(+\s?(\w+|['"][^'"]+['"])(:\d+\.?\d*)?,\s?\(+\s?['"\w]+/.test(file)){ //newick tree
   			parsetree(file,filename);
   		}
   		else{ 
   			errors.push("Couldn't identify fileformat for "+filename);
   		}
	});
	
	var namearr = [];
	if($.isEmptyObject(Tsequences) && $.isEmptyObject(sequences)) errors.push("Sequence data is missing");
	else if(!$.isEmptyObject(Tsequences)) namearr = Object.keys(Tsequences);
	
	if($.isEmptyObject(Ttreedata) && $.isEmptyObject(treedata)){
		//no tree: fill placeholders (otherwise done by jsPhyloSVG)
		visiblerows.removeAll(); leafnodes = {};
		var nodecount = 0; var leafcount = namearr.length; Ttreesource = false;
		$.each(namearr,function(indx,arrname){
			leafnodes[arrname] = {name:arrname};
			visiblerows.push(arrname); 
		});
	}
	else if(!$.isEmptyObject(Ttreedata)){ //check sequence data compatibility with the tree
		var treetype = Ttreedata.phyloxml ? 'phyloxml' : 'newick';
		var nodecount = treetype=='phyloxml' ? $(file).find("clade").length : Ttreedata.newick.match(/\(/g).length;
		var leafcount = treetype=='phyloxml' ? $(file).find("name").length : Ttreedata.newick.match(/,/g).length+1;
		if(leafcount > namearr.length && !$.isEmptyObject(Tsequences)) notes.push("Some tree leafs has no sequence data");
		/*$.each(namearr,function(indx,name){
			if(Ttreedata[treetype].indexOf(name)==-1){ errors.push("Some sequence names missing from the tree <br> ('"+name+"' etc.)"); return false; }
		});*/
	}
	//var seqnames = Object.keys(Tnames).sort(); var treenames = Ttreedata.newick.match(/[a-z]+\w+/ig).sort();
	
	if(errors.length==0){ //no errors - use data from placeholders
		if(options.dialog){ setTimeout(function(){ options.dialog.closest(".popupwindow").find(".closebtn").click() }, 2000); }//close import window
		if(treeoverwrite){ notes.push('Tree data found in multiple files. Using '+Ttreesource); }
		if(seqoverwrite){ notes.push('Sequence data found in multiple files. Using '+Tseqsource); }
		if(notes.length!=0){
			var ul = document.createElement("ul");
			$.each(notes,function(j,note){ $(ul).append("<li>"+note+"</li>") }); 
			setTimeout(function(){ makewindow('File import warnings',['<br>',ul,'<br>'],{btn:'OK',icn:'info.png'}); }, 3000); 
		}
		
	  	if(!$.isEmptyObject(Tsequences)){ //sequence data drop in
			Tminseqlen = Tsequences[namearr[0]].length;
			var longestseq = '', hasdot = false;
			for(var n=0;n<namearr.length;n++){ //count sequence lengths
				var tmpseq = Tsequences[namearr[n]].join('');
				if(!hasdot && tmpseq.indexOf('.')!=-1) hasdot = true;
				if(tmpseq.length >= Talignlen){ Talignlen = tmpseq.length }
				tmpseq = tmpseq.replace(/-/g,'');
				var seqlen = tmpseq.length;
   				if(seqlen >= Tmaxseqlen){ Tmaxseqlen = seqlen; longestseq = tmpseq; }
	   			if(seqlen <= Tminseqlen){ Tminseqlen = seqlen; }
			}
			model.hasdot(hasdot); model.currentid('');
			var dnachars = new RegExp('['+alphabet.dna.slice(0,-2).join('')+'_.:?!'+']','ig');
			longestseq = longestseq.replace(dnachars,''); //check if a sequence consists of DNA symbols
			if(longestseq.length==0){ model.seqtype('dna') } else if(longestseq.replace(/u/ig,'').length==0){ model.seqtype('rna') } else{ model.seqtype('residues') }
			sequences = Tsequences; model.totalseqcount(namearr.length); model.alignlen(Talignlen);
			model.minseqlen(Tminseqlen); model.maxseqlen(Tmaxseqlen); idnames = Tidnames;
			model.seqsource(Tseqsource); maskedcols = [];
			visiblecols.removeAll(); for(var c=0;c<model.alignlen();c++){ visiblecols.push(c); }//mark visible columns
			model.undostack.remove(function(item){ return item.type=='seq'} );
			makecolors();
	  	}
		
	  	if(!$.isEmptyObject(Ttreedata)){ //tree data drop in
	  		treedata = Ttreedata; model.treesource(Ttreesource); model.nodecount(nodecount); model.leafcount(leafcount);
	  		model.treesnapshot = ''; model.undostack.remove(function(item){ return item.type=='tree'} );
	  		if(!$.isEmptyObject(treesvg)) treesvg.loaddata(treedata.phyloxml||treedata.newick);
	  	}	
	  
	  	model.activeundo(''); model.treealtered(false);
   	  	if($.isEmptyObject(treesvg)) redraw();
   	  	return true;
	} else { //diplay errors, no import
		var ul = document.createElement("ul");
		$(ul).css('color','red');
		$.each(errors,function(j,err){ $(ul).append("<li>"+err+"</li>") });
		if(options.dialog){  options.dialog.find("ul").after('<br><b>File import errors:</b><br>',ul); }
		else { makewindow('File import failed',['<br>',ul,'<br>'],{btn:'OK',icn:'warning.png'}); }
		return false;
	}
}

/* Output file parsing */
function parseexport(filetype,options){
	var usemodel = false;
	if(!filetype&&!options){ //exportwindow: use datamodel
		usemodel = true;
		exportmodel.fileurl('');
		var filetype = exportmodel.format().name;
		var options = {};
		options.masksymbol = exportmodel.masksymbol()=='lowercase'? false : exportmodel.masksymbol();
		options.includetree = exportmodel.incltree();
		options.tags = exportmodel.variant().name&&(exportmodel.variant().name=='extended newick');
		options.includeanc = exportmodel.inclancestral();
	} else if(!options) var options = {};
	var output = '', ids = [], regexstr = '', dict = {};
	
	if(options.masksymbol){ $.each(alphabet[model.seqtype()],function(i,letter){ //translation for masked positions
		if(symbols[letter]['masked']) dict[symbols[letter]['masked']] = options.masksymbol;
	});}
	dict['!'] = '?'; dict['='] = '*';
	if(options.gapsymbol){ $.each(['-','_','.',':'],function(i,v){ dict[v] = options.gapsymbol; }); }
	else { $.each(['_','.',':'],function(i,v){ dict[v] = '-'; }); }
	$.each(dict,function(k,v){ regexstr += k; });
	var regex = regexstr ? new RegExp('['+regexstr+']','g') : '';
	var translate = regexstr ? function(s){ return dict[s] || s; } : '';
	
	if(filetype=='newick'||options.includetree){
		var treefile = treesvg.data.root.write(options.tags,!options.includeanc); 
	}else{ var treefile = ''; }
	
	if(options.includeanc) ids = Object.keys(sequences); else ids = Object.keys(leafnodes);
	var specount = ids.length; var ntcount = model.alignlen();
	
	if(filetype=='fasta'){
		$.each(ids,function(j,id){
			output += '>'+id+"\n";
			for(var c=0;c<sequences[id].length;c+=50){
				output += sequences[id].slice(c,c+49).join('').replace(regex,translate)+"\n";
			}
		});
	}
	else if(filetype=='phylip'){
		output = specount+" "+ntcount+"\n";
		$.each(ids,function(j,id){
			
		});
	}
	else if(filetype=='newick'){ output = treefile; }
	
	if(usemodel){
		$('#exportedwindow .paper').text(output);
		$('#exportwrap').addClass('flipped');
		communicate('makefile',{filename:exportmodel.filename()+exportmodel.fileext(),filedata:output},exportmodel.fileurl);
	}
	return output;
}

/* Rendrering: tree & sequence alignment areas */
function makecolors(){
	if(model.colorscheme()=='taylor'){
   		colors = { "A":["","rgb(204, 255, 0)"], "R":["","rgb(0, 0, 255)"], "N":["","rgb(204, 0, 255)"], "D":["","rgb(255, 0, 0)"], "C":["","rgb(255, 255, 0)"], "Q":["","rgb(255, 0, 204)"], "E":["","rgb(255, 0, 102)"], "G":["","rgb(255, 153, 0)"], "H":["","rgb(0, 102, 255)"], "I":["","rgb(102, 255, 0)"], "L":["","rgb(51, 255, 0)"], "K":["","rgb(102, 0, 255)"], "M":["","rgb(0, 255, 0)"], "F":["","rgb(0, 255, 102)"], "P":["","rgb(255, 204, 0)"], "S":["","rgb(255, 51, 0)"], "T":["","rgb(255, 102, 0)"], "W":["","rgb(0, 204, 255)"], "Y":["","rgb(0, 255, 204)"], "V":["","rgb(153, 255, 0)"], "B":["","rgb(255, 255, 255)"], "Z":["","rgb(255, 255, 255)"], "X":["","rgb(255, 255, 255)"]};
   	}
   	else if(model.colorscheme()=='dna'){ colors = {"A":["","rgb(0,0,255)"],"T":["","rgb(255, 255, 0)"],"G":["","rgb(0, 255, 0)"],"C":["","rgb(255, 0, 0)"],"U":["","rgb(255, 255, 0)"]}; }
   	colors['-']=['#ccc',"rgb(255,255,255)"];colors['.']=['#e3e3e3',"rgb(255,255,255)"];colors['?']=['#f00',"rgb(255,255,255)"];
   	if(model.hasdot()) colors['-'][0] = "#999"; //darker del.
   	for(var i=0;i<letters.length;i++){ //make colors for all letters/symbols (+darker bg for masked symbols)
   		var symbol = letters[i];
   		var unmasked = i%2==0 ? true : false;
   		if(model.colorscheme()=='rainbow'){
   			var color = unmasked ? rainbow(letters.length,i) : mixcolors(rainbow(letters.length,i-1),[100,100,100]);
   			if(!colors[symbol]){ colors[symbol] = ["",color]; }
   		}
   		else{
   			if(!colors[symbol]){ //symbols outside of colorscheme: grey bg
   				if(unmasked){ colors[symbol] = ["","rgb(200,200,200)"]; }
   				else{ colors[symbol] = ["",mixcolors(colors[letters[i-1]][1],[100,100,100])]; }
   			}
   		}
   		var rgb = colors[symbol][1].match(/\d{1,3}/g);
   		var brightness = Math.sqrt(rgb[0]*rgb[0]*.241 + rgb[1]*rgb[1]*.691 + rgb[2]*rgb[2]*.068); //perceived brightness
   		var fgcolor = brightness<110 ? "#eee" : "#333"; //lettercolor for dark background
   		if(!colors[symbol][0]){ colors[symbol][0] = fgcolor; }
   		
   		symbols[symbol] = { 'fgcolor' : colors[symbol][0], 'bgcolor' : colors[symbol][1] };
   		symbols[symbol]['masked'] = unmasked ? letters[i+1] : symbol;
   		symbols[symbol]['unmasked'] = unmasked ? symbol : letters[i-1];
   	} //Result: symbols = {'A':{'fgcolor':'#ccc','bgcolor':'#fff','masked':'a','unmasked':'A'},'a':{maskedcolors,..}}
}

//Note: color palette: http://jsfiddle.net/k8NC2/1/  jalview color schemes
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
    return 'rgb('+parseInt(r*255)+','+parseInt(g*255)+','+parseInt(b*255)+')';
}

function mixcolors(color,mix){
	var rgb = color.match(/\d{1,3}/g);
	var r = Math.floor((parseInt(rgb[0])+mix[0])/2);
	var g = Math.floor((parseInt(rgb[1])+mix[1])/2);
	var b = Math.floor((parseInt(rgb[2])+mix[2])/2);
	return "rgb("+r+","+g+","+b+")";
}

function redraw(zoom){
	canvaspos = []; colflags = []; rowflags = []; //clear selections and its flags
	lastselectionid = 0; activeid = false;
	$("#seq div[id*='selection'],#seq div[id*='cross']").remove();
	
	var newheight = visiblerows().length==0 ? model.leafcount()*model.boxh() : visiblerows().length*model.boxh();
	if(!zoom){ dom.treewrap.css('height',newheight); $("#names svg").css('font-size',model.fontsize()+'px'); }
	if(treedata && $.isEmptyObject(treesvg)){//make tree SVG
		$label = $("#namelabel"); $labelspan = $("#namelabel span");
		dom.tree.empty(); dom.names.empty();
		dom.wrap.css('left',0); dom.seq.css('margin-top',0);
		dom.treewrap.css({top:0,height:newheight});
		$("#notree").fadeOut(); dom.tree.css('box-shadow','none');
		dom.treewrap.css('background-color','white');
		
		Smits.Common.nodeIdIncrement = 0;
		treesvg = new Smits.PhyloCanvas(treedata, model.nameswidth(), dom.treewrap.width(), newheight);
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
	  					if(helper) helper.css({left:evt.pageX+15,top:evt.pageY-5});
	  				}
	  	}); } });
	}
	else if(!treedata && !zoom){ //no tree
		dom.tree.empty(); dom.names.empty();
		dom.treewrap.css('background-color','transparent');
		$("#notree").fadeIn(); $("#tree").css('box-shadow','-2px 0 2px #ccc inset');
		$.each(names,function(name){
			var nspan = $('<span style="height:'+model.boxh()+'px;font-size:'+model.fontsize()+'px">'+name+'</span>');
			var hovertimer;
			nspan.mouseenter(function(){
				hovertimer = setTimeout(function(){
					$label.css({
						'font-size' : model.fontsize()+'px',
						'top': nspan.offset().top+'px',
						'left' : $("#right").position().left-14+'px'
					});
					$labelspan.css('margin-left',0-dom.names.innerWidth()+5+'px'); $labelspan.text(name);
					$label.css('display','block'); setTimeout(function(){ $label.css('opacity',1) },50);
				},800);
			}); 
			nspan.mouseleave(function(){ 
				clearTimeout(hovertimer);
				$label.css('opacity',0);
				setTimeout(function(){$label.hide()},500); 
			});
			dom.names.append(nspan);
		});
	}
   	if(dom.treewrap.css('display')=='none') setTimeout(function(){dom.treewrap.fadeTo(300,1,'linear')},10);
   	
	var newwidth = visiblecols().length*model.boxw();
	if(zoom){//keep sequence positioned in center of viewport after zoom
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
		if(model.treesource()){
			$("#names svg").animate({'font-size':model.fontsize()},500,'linear');
		}
		else{
			$("#names span").css({'height':model.boxh()+'px','font-size':model.fontsize()+'px'});
		}
	}
	dom.seq.css({ 'width':newwidth, 'height':newheight });
	makeRuler();
	makeCanvases(); makeImage();
	if(!dom.seqwindow.data("contentWidth")){ mCustomScrollbar(0,"easeOutCirc","auto","yes","yes",10); } else { $(window).trigger('resize'); }
}

function refresh(e,hidemenu){ //redraw tree & sequence
	if(e) e.stopPropagation();
	if(hidemenu) $('html').click();//hidetooltip();
	treesvg.refresh();
};

function makeCanvases(){
	var tmpel,tmpcanv,letterw,maxletterw,fcanv,roundcorners=false;
	$.each(symbols,function(symbol,data){
		tmpel = document.createElement('canvas');
		tmpel.width = model.boxw();
		tmpel.height = model.boxh();
		tmpcanv = tmpel.getContext('2d');
		tmpcanv.fillStyle = data.bgcolor;
		if(model.zoomlevel()==1){ tmpcanv.fillRect(0,0,1,2); }
		else{
			if(roundcorners && model.zoomlevel()>4){
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
			var canvassymbol = canvassymbols[symbol] || symbol;
			tmpcanv.font = model.fontsize()+'px Courier';
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
				tmpcanv.shadowOffsetY = -0.5;
				tmpcanv.shadowBlur = 1;
			  }
			 }
			tmpcanv.fillText(canvassymbol,tmpel.width/2+1,tmpel.height/2);
		}
		symbols[symbol]['canvas'] = tmpel;
		if(model.zoomlevel()==10) symbols[symbol]['refcanvas'] = tmpel;
	});
	//$.each(symbols,function(i,data){$('#top').append(' ',data.canvas)}); //Debug
}

var tmpc = 0;
function makeImage(target){
	//var start = new Date().getTime();
	var targetx,targety;
	if(target){
		var tarr = target.split(':');
		if(tarr[0]=='x'){ targetx = parseInt(tarr[1]); } else if(tarr[0]=='y'){ targety = parseInt(tarr[1]); }
	}
	if(!targetx){ targetx = $("#wrap").position().left; }
	if(!targety){ targety = parseInt(dom.seq.css('margin-top')); }
	var colstartpix = parseInt((0-targetx)/model.boxw());
	var rowstartpix = parseInt((0-targety)/model.boxh());
	var colstart = colstartpix-(colstartpix%colstep); //snap to (colstep-paced) tile grid
	var colend = parseInt((dom.seqwindow.innerWidth()-targetx)/model.boxw());
	if(colend>visiblecols().length){ colend = visiblecols().length; }
	var rowstart = rowstartpix-(rowstartpix%rowstep); //snap to grid
	var rowend = parseInt(((dom.seqwindow.innerHeight()-$("#ruler").outerHeight())-targety)/model.boxh());
	if(rowend>visiblerows().length){ rowend = visiblerows().length; }
	var rowdraws = [];
	var canvascount = 0;
	var totalcount = 0;
	var $spinner = $("#spinner");
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
				var tile = $('<div class="tile">');
				canvas.width = colstep*model.boxw();
				canvas.height = rowstep*model.boxh();
				var endrow = rowdraws[r+'|'+c].row+rowstep>visiblerows().length ? visiblerows().length : rowdraws[r+'|'+c].row+rowstep;
				canvas.setAttribute('id',r+'|'+c);
				var canv = canvas.getContext('2d');
				//canv.clearRect(0,0,canvas.width,canvas.height);
				while(rowdraws[r+'|'+c].canvasrow < endrow){
					var data = sequences[visiblerows()[rowdraws[r+'|'+c].canvasrow]];
					if(!data){ rowdraws[r+'|'+c].canvasrow++; continue; }//no sequence data: skip
					var endcol = rowdraws[r+'|'+c].col+colstep>data.length ? data.length : rowdraws[r+'|'+c].col+colstep;
					for(var canvascol=c;canvascol<endcol;canvascol++){
						seqletter = data[visiblecols()[canvascol]];
						if(!symbols[seqletter]){ symbols[seqletter] = symbols['?'] }
						canv.drawImage( symbols[seqletter]['canvas'], (canvascol - rowdraws[r+'|'+c].col)*model.boxw()+1, (rowdraws[r+'|'+c].canvasrow - rowdraws[r+'|'+c].row)*model.boxh()+1);
					}
					rowdraws[r+'|'+c].canvasrow++;
				}
				tile.css({'left': c*model.boxw()+'px', 'top': r*model.boxh()+'px'});
				dom.seq.append(tile);
				tile.append(canvas);
				rowdraws[r+'|'+c] = {};
				setTimeout(function(){ tile.css('opacity',1) },50);
				setTimeout(function(){ //remove any covered canvas.
					var pos1 = tile.position(); var prevdivs = tile.prevAll('.tile');
					prevdivs.each(function(){
						var pos2 = $(this).position(); 
						if(pos1.left==pos2.left && pos1.top==pos2.top) $(this).remove(); 
				}); },500);
				if(canvascount==totalcount){ if($spinner.css('display')=='block' ){ setTimeout(function(){$spinner.fadeOut(200);},50); } }
			}}(row,col),10);
		}//make canvas	
	  }//for cols
	}//for rows
	if(totalcount>2){ $spinner.css({display:'block',opacity:1}); }
}


function makeRuler(){
	var $ruler = $("#ruler");
	$ruler.empty();
	var tick = 10;
	var tickw = tick*model.boxw()-4;
	var k = '';
	var markerdiv = function(scol,ecol){ //make markers for hidden columns
		var capindex = scol==0 ? 0 : visiblecols.indexOf(scol-1)+1;
		var l = capindex*model.boxw()-7;
		var colspan = ecol-scol;
		var div = $('<div class="marker" style="left:'+l+'px">&#x25BC</div>');
		div.mouseenter(function(e){ tooltip(e,'Click to reveal '+colspan+' hidden columns.',{target:div}) });
		div.click(function(){
			for(var c=scol;c<ecol;c++,capindex++){ visiblecols.splice(capindex,0,c); } 
			hidetooltip(); redraw(); 
		});
		return div;
	}
	if(visiblecols()[0]!==0){ $ruler.append(markerdiv(0,visiblecols()[0])); }
	for(var t=0;t<visiblecols().length-1;t++){
		if((visiblecols()[t+1]-visiblecols()[t])!=1){ $ruler.append(markerdiv(visiblecols()[t]+1,visiblecols()[t+1])); }
	  	if(t%tick==0){//make ruler tickmarks
			k = t;
			if(model.boxw()<4){ if(t%100==0){ if(t>=1000){ k = '<span>'+(t/1000)+'K</span>'; }else{ k = '<span>'+t+'</span>'; } }else{ k = '&nbsp;'; } }
			$ruler.append($('<span style="width:'+tickw+'px">'+k+'</span>'));
		}
	}
	if(visiblecols()[visiblecols().length-1] != model.alignlen()-1){
		$ruler.append(markerdiv(visiblecols()[visiblecols().length-1]+1,model.alignlen()));
	}
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
	movednode.highlight();
	setTimeout(function(){
		tooltip('','Move node: '+(drag?'drop node to':'click on')+' target branch or node.',{target:{startx:200,starty:100},arrow:'bottom',autohide:6000});
	}, 400);
	if(drag){
		$("#right").addClass('dragmode');
		setTimeout(function(){
			tooltip('','Delete node: drop node here.',{target:{startx:900,starty:105},arrow:'bottom',autohide:6000});
		}, 400);
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
	  	if(movedtype=='circle'){ //add drag helper (node preview)
	  		var helper = $(movednode.makeCanvas()).attr('id','draggedtree');
	  	}
	  	else if(movedtype=='tspan'){
	  		var helper = $('<div id="draggedlabel">'+movednode.name+'</div>');
	  	}
	  	$("#page").append(helper);
	}//drag
	$("body").one('mouseup',function(evnt){
		var targettype = evnt.target.tagName;
	  	if(targettype=='circle'||targettype=='tspan'||(targettype=='line'&&$(evnt.target).attr('class')=='horizontal')){
	  		var raphid = targettype=='tspan'? evnt.target.parentNode.raphaelid : evnt.target.raphaelid;
	  		var svgid = targettype=='tspan'? 'svg2' : 'svg1';
	  		var targetnode = treesvg.svg[svgid].getById(raphid).data('node');
	  		if(movednode && targetnode){ movednode.move(targetnode); refresh(); }
	  	}
	  	else if (drag && targettype=='DIV' && evnt.target.id=='treebin'){ if(movednode) movednode.remove(); refresh(); }
	  	movednode.unhighlight();
	  	$("#left,#right").removeClass('dragmode');
	  	if(drag){ helper.remove(); $("div.treescroll").remove(); }
	  	$("#page").unbind('mousemove'); hidetooltip();
	 });
	 if(drag) return helper;
}

function tooltip(evt,title,options){ //make tooltips & pop-up menus
	if(!options) options = {};
	if(typeof(title)=='string') title = title.replace(/#/g,'');
	if(options.tooltip){
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
	if(options.style) tipdiv.addClass(options.style);
	
	var node = options.target || false;
	if(node){ //tooltip placement
    	if(node.edgeCircleHighlight){
    		var x = $(node.edgeCircleHighlight.node).offset().left+25;
    		var y = $(node.edgeCircleHighlight.node).offset().top-7;
    	} 
    	else if(!isNaN(node.pageX)||!isNaN(node.startx)){ //place as seqinfo tooltip
    		var boxoffset = options.container? $(options.container).offset() : 0;
    		var x = !isNaN(node.startx)? node.startx : node.clientX-boxoffset.left;
    		var y = !isNaN(node.starty)? node.starty : node.clientY-boxoffset.top;
    		node.height = !isNaN(node.startx)? model.boxh() : 0;
    		node.width = !isNaN(node.starty)? model.boxw() : 0;
    		if(arr=='left' && options.container=="#seq"){ x += node.width+13; y += (node.height/2)-11; }
    	}
    	else {
    		if(node.tagName=='LI'){ //place as submenu
    			var x = $(node).innerWidth()-5;
    			var y = $(node).position().top-3;
    		}
    		else{
    			var x = $(node).offset().left+15;
    			var y = $(node).offset().top+15;
    			if($(node).hasClass('svgicon')){ x+=20; y-=18; }
    			if(!arr) y+= options.height||$(node).height();
    		}
    	}
    	if(arr=='top') y+=(node.height||$(node).height())+9;
    } else { var x = evt.pageX+10; var y = evt.pageY+10; }
    var rightedge = $('body').innerWidth()-200;
    if(!options.container && x > rightedge) x = rightedge;
    if(!options.svg) tipdiv.css({left:parseInt(x),top:parseInt(y)});
    		
    if(options.data){ //generate pop-up menu
      if(options.svg && node){ //tree node popup menu
    	var nodetitle = $('<span class="right">'+(node._countAllHidden?' <span class="svgicon" title="Hidden leaves">'+svgicon('hide')+'</span>'+node._countAllHidden:'')+'</span>');
    	var nodeicon = $('<span class="svgicon">'+svgicon('info')+'</span>').css({'margin-left':'10px', 'padding-right':0,cursor:'pointer'});
    	nodeicon.mouseenter(function(e){ //node info
    		var nodeul = $('<ul>'); if(node.children.length) nodeul.append('<li>Visible leaves: '+node._countAllChildren+'</li>');
    		if(node._countAllHidden) nodeul.append('<li>Hidden leaves: '+node._countAllHidden+'</li>');
    		nodeul.append('<li>Branch length: '+(Math.round(node.len*1000)/1000)+'</li>','<li>Length from root: '+(Math.round(node.lenFromRoot*1000)/1000)+'</li>','<li>Levels from root: '+node.level+'</li>');
    		if(node.confidence) nodeul.append('<li>Branch support: '+node.confidence+'</li>');
    		var nodetip = tooltip(e,'',{target:nodeicon,data:nodeul[0],arrow:'left',style:'nomenu'});
    		nodeicon.one('mouseleave',function(){ hidetooltip(nodetip) });
    	});
    	nodetitle.append(nodeicon);
    	tiptitle.html(node.parent?title:'Root');
    	tiptitle.append(nodetitle);
    	var ul = $('<ul>');
    	var hideli = $('<li class="arr" '+(node.parent?'':'style="color:#888"')+'><span class="svgicon" title="Collapse node and its children">'+svgicon('hide')+'</span>Hide this node <span class="right">\u25B8</span></li>');
    	hideli.click(function(){ node.hideToggle(); refresh('','menu'); });
    	var hidemenu = {};
    	$.each(node.children,function(i,child){ //child nodes submenu
    		if (child.type == 'ancestral') return true; //skip anc.
    		var litxt = '<span class="svgicon" title="(Un)collapse a child node">'+(i==0?svgicon('upper'):svgicon('lower'))+'</span>'+(child.hidden?'Show ':'Hide ')+(i==0?'upper ':'lower ')+' child';
    		hidemenu[litxt] = { click: function(e){ child.hideToggle(); refresh(e,'menu'); } };
    		if(child.children.length && child.hidden){ //preview hidden children
    			var createpreview = function(){ //create treepreview on the fly
    				var preview = $('<span style="margin-left:5px" class="svgicon">'+svgicon('view')+'</span>');
    				var ptip = '';
    				preview.mouseenter(function(e){
    					var pcanvas = child.makeCanvas();
    					pcanvas.style.borderRadius = '2px';
    					ptip = tooltip(e,'',{target:preview,data:pcanvas,arrow:'left'});
    					preview.one('mouseleave',function(){ hidetooltip(ptip); });
    				});
    				return preview;
    			}
    			hidemenu[litxt]['append'] = createpreview;
    		}
    	});
    	hidemenu['<span class="svgicon" title="Uncollapse all child nodes">'+svgicon('children')+'</span>Show all children'] = function(e){ node.showSubtree(); refresh(e,'menu'); };
    	hideli.mouseenter(function(evt){ tooltip(evt,'',{target:hideli[0],data:hidemenu}); });
    	var ancnode = node.children[node.children.length-2];
    	if(ancnode.type=='ancestral'){ //ancestral nodes submenu
    		var h = ancnode.hidden? 'Show':'Hide';
    		var ancli = $('<li class="arr"><span class="svgicon" title="'+h+' ancestral sequence">'+svgicon('ancestral')+'</span>'+h+' ancestral seq. <span class="right">\u25B8</span></li>');
    		ancli.click(function(){ ancnode.hideToggle(); refresh(); });
    		var ancmenu = {};
    		ancmenu['<span class="svgicon" title="Show ancestral sequences of the whole subtree">'+svgicon('ancestral')+'</span>Show subtree ancestors'] = function(e){ node.showSubtree('anc'); refresh(e,'menu'); };
    		ancmenu['<span class="svgicon" title="Hide ancestral sequences of the whole subtree">'+svgicon('ancestral')+'</span>Hide subtree ancestors'] = function(e){ node.showSubtree('anc','hide'); refresh(e,'menu'); };
    		ancli.mouseenter(function(evt){ tooltip(evt,'',{target:ancli[0],data:ancmenu}); });
    	} else var ancli = '';
    	var swapli = $('<li style="border-top:1px solid #999"><span class="svgicon" title="Swap places of child nodes">'+svgicon('swap')+'</span>Swap children</li>');
    	swapli.click(function(){ node.swap(); refresh(); });
    	var moveli = node.parent? $('<li><span class="svgicon" title="Graft this node to another branch in the tree">'+svgicon('move')+'</span>Move node</li>') : '';
    	if(moveli) moveli.click(function(){ movenode('',node,'circle'); });
    	var rerootli = node.parent? $('<li><span class="svgicon" title="Place this node as the tree outgroup">'+svgicon('root')+'</span>Place root here</li>') : '';
    	if(rerootli) rerootli.click(function(){ node.reRoot(); refresh(); });
    	var remli = node.parent? $('<li><span class="svgicon" title="Remove this node and its children from the tree">'+svgicon('trash')+'</span>Remove node</li>') : '';
    	if(remli) remli.click(function(){ node.remove(); refresh(); });
    	var expli = $('<li style="border-top:1px solid #999"><span class="svgicon" title="Export this subtree in newick format">'+svgicon('file')+'</span>Export data</li>');
    	expli.click(function(){ console.log(node.write()); hidetooltip(tipdiv); });
    	ul.append(hideli,ancli,swapli,moveli,rerootli,remli,expli);
    	tipcontent.append(ul);
    	tipcontentwrap.css('height',tipcontent.innerHeight()+'px'); //slidedown
      }
      else{ //general pop-up menu
      	if(options.data.tagName) tipcontent.append(options.data); //insert DOM element
      	else{ //list-type menu
      		var ul = $('<ul>');
      		var hassubmenu = false;
    		$.each(options.data,function(txt,obj){
    			var li = $('<li>');
	    		if(typeof(obj)=='object'){ //nested menu
    				li.click(obj['click']);
    				if(obj['submenu']){//submenu
    					li.html(txt+'<span class="right">\u25B8</span>');
    					li.addClass('arr');
    					li.mouseenter(function(evt){ tooltip(evt,'',{target:li[0],data:obj['submenu']}); }); 
	    			} else { li.html(txt); }
    				if(obj['mouseover']){ li.mouseenter(obj['mouseover']); }
    				if(obj['mouseout']){ li.mouseleave(obj['mouseout']); }
    				if(obj['append']){ li.append(obj['append']); }
    			}
	    		else{
    				li.html(txt);
    				li.click(obj);
				}
				ul.append(li);
    		});
    		tipcontent.append(ul);
	    	if(title){ tiptitle.text(title); }else{ tiptitle.css('display','none'); ul.css('border-top','none'); }
    		if(node && node.tagName == 'LI'){//submenu
    			$(node).append(tipdiv);
		   		$(node).one('mouseleave',function(){ hidetooltip(tipdiv); }); 
    		}
      		$('html').one('click', function(){ hidetooltip('','','noinfo'); if(node.treenode) node.treenode.unhighlight(); });
     	}
   	  }
   }
   else{ //tooltip
		if(!node.parent&&node.len){ title = 'Root node'; }
    	tiptitle.empty().append(title);
    	if(node.nodeType) $(node).mouseleave(function(){ hidetooltip(tipdiv); });
    	else if(!node.edgeCircleHighlight&&!options.nohide) setTimeout(function(){ hidetooltip(tipdiv) },options.autohide||3000); //self-hide
   }
   if(arr=='top'||arr=='bottom'){
   		var adj = tipdiv.innerWidth()/2; 
   		if(node) adj-=(node.width||$(node).innerWidth())/2; 
   		tipdiv.css('left','-='+adj);
   		if(arr=='bottom') tipdiv.css('top','-='+(tipdiv.innerHeight()+19));
   }
   tipdiv.addClass('opaque');
   return tipdiv;
}

function hidetooltip(tooltip,exclude,noinfo){
	if(noinfo){ $("#rborder").removeClass('opaque'); $("#rborder").css('display','none'); }
	tooltips = tooltip&&!exclude ? $(tooltip) : $("div.tooltip");
	if(exclude) tooltips = tooltips.not(tooltip);
	tooltips.each(function(){
		var tip = $(this);
		tip.removeClass('opaque');
		if(tip.attr('id')){ 
			setTimeout(function(){
				tip.css('display','none');
				$(".tooltipcontent",tip).empty(); 
				if($(".tooltipcontentwrap",tip).hasClass('hidden')) $(".tooltipcontentwrap",tip).css('height',0); 
			},300);
		}
		else setTimeout(function(){ tip.remove(); },400);
	});
}

function selectionsize(e,id,type){ //make or resize a sequence selection box
	if(typeof(type)=='undefined'){ var type = 'rb', start = {}; }
	else if(typeof(type)=='object'&&type.x&&type.y){ //type = mouse startpos{x,y}
		var dx = e.pageX-type.x; var dy = e.pageY-type.y;
		if(dx<10||dy<10){ return; }
		else{ var start = {x:type.x,y:type.y}, type = 'rb'; }
	}
	if($("#selection"+id).length==0){//create selectionbox
		dom.seq.append('<div id="selection'+id+'" class="selection"><div class="description"></div><div class="ltresize"></div><div class="rbresize"></div></div>\
			<div id="vertcross'+id+'" class="selectioncross"><div class="lresize"></div><div class="rresize"></div></div>\
			<div id="horicross'+id+'" class="selectioncross"><div class="tresize"></div><div class="bresize"></div></div>');
		var x = (start.x||e.pageX)-dom.seq.offset().left-2;
		x = x-(x%model.boxw());
		var y = (start.y||e.pageY)-dom.seq.offset().top;
		y = y-(y%model.boxh());
		if(x<0){ x=0; } if(y<0){ y=0; }
		$("#selection"+id).css({'left':x,'top':y,'width':model.boxw(),'height':model.boxh(),'display':'block'});
		$("#vertcross"+id).css({'left':x,'top':'0','width':model.boxw(),'height':dom.seq.innerHeight(),'display':model.selmode()=='columns'?'block':'none'});
		$("#horicross"+id).css({'left':'0','top':y,'width':dom.seq.innerWidth(),'height':model.boxh(),'display':model.selmode()=='rows'?'block':'none'});
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
	else{ $("#seq div.selection").each(function(){ id = this.id.substr(9); $("#selection"+id).remove(); $("#vertcross"+id).remove(); $("#horicross"+id).remove(); }); }
}

function toggleselection(type){ //toggle row/column selection
	if(type=='default'){ toggleselection('hide rows'); type='hide columns'; }
	else if(type=='columns'){ toggleselection('hide rows'); type='show columns'; }
	else if(type=='rows'){ toggleselection('show rows'); type='hide columns'; }
	var divs = type.indexOf('rows')!=-1 ? $('div[id^="horicross"]') : ('div[id^="vertcross"]');
	$(divs).each(function(){
		if(type.indexOf('show')!=-1){ $(this).fadeIn(200); } else { $(this).fadeOut(200); }
	}); 
}

function seqinfo(e){ //character info tooltip (on sequence click)
	if(!e.pageX||!e.pageY) return false;
	var x = e.pageX-dom.seq.offset().left-2;
	x = parseInt(x/model.boxw());
	var y = e.pageY-dom.seq.offset().top-2;
	y = parseInt(y/model.boxh());
	if(x<0){ x=0; } if(y<0){ y=0; }
	var col = visiblecols()[x]; var rowid = visiblerows()[y];
	if(!sequences[rowid]) return false;
	var suppl = col==x ? '' : '<br>(column '+(col+1)+' if uncollapsed)';
	var seqpos = sequences[rowid].slice(0,col+1).join('').replace(/[_\-.:]/g,'').length;
	var symb = typeof(sequences[rowid][col])=='undefined' ? '' : sequences[rowid][col];
	symb = canvaslabels[symb]||symb;
	var symbcanvas = typeof(symbols[symb])!='undefined'? symbols[symb]['refcanvas'] : '<span style="color:orange">'+symb+'</span>';
	var name = typeof(leafnodes[rowid])=='undefined' ? '' : leafnodes[rowid].name;
	var content = $('<span style="color:orange">'+name+'</span><br>').add(symbcanvas).add('<span> row '+(y+1)+' position '+seqpos+' column '+(x+1)+suppl+'</span>');
	return {content:content, row:x, col:y, startx:x*model.boxw(), starty:y*model.boxh()}
}

function hidecolumns(e,id){
	if(e){ e.stopPropagation(); hidetooltip(); }
	if(id=='revealall'){ visiblecols([]); for(var c=0;c<model.alignlen();c++){ visiblecols.push(c); } }
	else{
		registerselections(id);
		var adj = 0; //adjustment for  array length decrease
		for(var c=0;c<colflags.length;c++){ if(colflags[c]){ visiblecols.splice(c-adj,1); adj++; } }//remove columns from list
	}
	redraw();
}

function togglerows(e,id,action){ //show/hide seq. rows & tree leafs
	if(e){ e.stopPropagation(); hidetooltip(); }
	var idarr = [];
	if(action=='selection'){//hide selected rows
		action = 'hide';
		registerselections(id);
		for(var r=0;r<rowflags.length;r++){ if(rowflags[r]){ idarr.push(visiblerows()[r]); } } 
	}//else: hide/show from tree
	if(typeof(idarr) != 'object'){ idarr = [idarr]; }
	for(var i=0;i<idarr.length;i++){ leafnodes[idarr[i]].hideToggle(action); }
	refresh();
}

function maskdata(e,id,action){ //mask a sequence region
	if(e){ e.stopPropagation(); hidetooltip(); }
	if(action.indexOf('unmask')!=-1){ var symboltype = 'unmasked'; var flag = false; }
	else{ var symboltype = 'masked'; var flag = 1; }
	registerselections(id);
	if(action.indexOf('all')!=-1){ for(var id in sequences){ for(var c=0;c<sequences[id].length;c++) sequences[id][c] = symbols[sequences[id][c]][symboltype]; } }
	else if(action=='maskcols'||action=='unmaskcols'){	
		for(var c=0;c<colflags.length;c++){
			if(colflags[c]){
				var colid = visiblecols()[c];
				for(var id in sequences){ if(visiblerows.indexOf(id)!=-1){ sequences[id][colid] = symbols[sequences[id][colid]][symboltype]; }}
				maskedcols[colid] = flag;
			}
		}
	}
	else if(action=='maskrows'||action=='unmaskrows'){
		for(var r=0;r<rowflags.length;r++){
			if(rowflags[r]){
				var id = visiblerows()[r];
				for(var i=0;i<sequences[id].length;i++){ sequences[id][i] = symbols[sequences[id][i]][symboltype]; }
			}
		}
	}
	else if(action=='maskselection'||action=='unmaskselection'){
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

/* Generate pop-up windows */
function makewindow(title,content,options,container){ //(string,array(,obj{flipside:'front'|'back',backfade,btn:string|jQObj|array,id:string},jQObj))
	if(!options){ var options = {}; }
	if(options.id && $('#'+options.id).length!=0){ $('#'+options.id).remove(); }//kill clones
	if(options.flipside){ //we make two-sided window
		var sideclass = 'side '+options.flipside;
	} else { var sideclass = 'zoomin'; }
	var windowdiv = $('<div class="popupwindow '+sideclass+'"></div>');
	if(options.id) windowdiv.attr('id',options.id);
	var shade = $("#backfade");
	var closebtn = $('<img src="img/closebtn.png" class="closebtn" title="Close window">');
	var closefunc = function(){ //close window
		var wrapdiv = container ? container : windowdiv; 
		wrapdiv.removeClass('zoomed'); setTimeout(function(){ wrapdiv.remove() },600); 
		if(shade.css('display')!='none'){ shade.css('opacity',0); setTimeout(function(){ shade.hide() },600); }
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
	contentdiv.css('max-height',$('#right').innerHeight()-100+'px');
	var headerdiv = $('<div class="windowheader"></div>');
	if(options.header){ $.each(options.header,function(i,val){ headerdiv.append(val) }); }
	if(options.icn) title = '<img class="windowicn" src="img/'+options.icn+'"> '+title;
	titlediv.html(title);
	$.each(content,function(i,val){ contentdiv.append(val) });
	windowdiv.append(headerdiv,contentdiv,titlediv,closebtn);
	
	var dragdiv = container||windowdiv;
	var toFront = function(windiv,first){ //bring window on top
		var maxz = Math.max.apply(null, $.map($('#page>div.popupwindow,div.popupwrap'), function(e,i){ return parseInt($(e).css('z-index'))||1; }));
		var curz = parseInt($(windiv).css('z-index'));
		if((curz<maxz) || (curz==maxz&&first)) $(windiv).css('z-index',maxz+1);
    }
	if($('#page>div.popupwindow').length>0){ //place new window
		toFront(dragdiv,'first');
		var pos = $('#page>div.popupwindow').last().position();
		dragdiv.css({'top':pos.top+20+'px','left':pos.left+20+'px'});
	}
	if(container){ container.append(windowdiv); } //add window to DOM
	else{
		$("#page").append(windowdiv);
	}
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
    	setTimeout(function(){ dragdiv.addClass('zoomed') },300);
    }
    else{ setTimeout(function(){ dragdiv.addClass('zoomed') },50); }
	return windowdiv;
}

//Content for different types of pop-up windows
function dialog(type,options){
	var helpimg = $('<img class="icn" src="img/help.png">');
	if(type=='import'){
		$('div.popupwindow').remove(); //close other windows
		var infodiv = $("<div>");
		var fileroute = window.File && window.FileReader && window.FileList ? 'localread' : 'upload';
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
		
		var dialogwrap = $('<div class="popupwrap zoomin"></div>');
		$("#page").append(dialogwrap);
		var desc = '<div class="sectiontitle"><img src="img/file.png"><span title="Select file(s) that contain aligned or unaligned '+
		'sequence (and tree) data. Supported filetypes: fasta, newick (.tree), HSAML (.xml), NEXUS, phylip, ClustalW (.aln), phyloXML" style="cursor:help">Import local files</span></div><br>';
		var dialog = makewindow("Import files",[desc,filedrag,ordiv,selectbtn,
			'<br><br><div class="sectiontitle"><img src="img/web.png"><span>Import remote files</span></div><br>',urladd,urlinput,'<span class="icon"></span><br>',dwnlbtn],{id:'import',backfade:true,flipside:'front',icn:'import.png'},dialogwrap);
		var flipdialog = makewindow("Import data",[infodiv],{backfade:false,flipside:'back',icn:'import.png'},dialogwrap);
	} //import dialog
	else if(type=='export'){
		if($("#exportwrap").length>0){ $("#exportwrap").click(); return; } //bring window to front
		var exportwrap = $('<div id="exportwrap" class="popupwrap zoomin">');
		$("#page").append(exportwrap);
		var frontcontent = $('<div class="sectiontitle" style="min-width:320px"><img src="img/file.png"><span>File</span></div>'+
		'<span class="cell">Data<hr><select data-bind="options:categories, optionsText:\'name\', value:category"></select></span>'+
		'<span class="cell" data-bind="with:category,fadevisible:category().formats.length>0">Format<hr><span data-bind="visible:formats.length==1,text:formats[0].name"></span><select data-bind="visible:formats.length>1, options:formats, optionsText:\'name\', value:$parent.format"></select></span>'+
		'<span class="cell" data-bind="with:format,fadevisible:format().variants.length>1">Variant<hr><select data-bind="options:variants, optionsText:\'name\', value:$parent.variant"></select></span> '+
		'<span class="svgicon" style="margin-left:-8px" data-bind="fadevisible:variant().desc,attr:{title:variant().desc}">'+svgicon('info',{fill:'#666'})+'</span><br>'+
		'&nbsp;Name: <input type="text" class="hidden" style="width:200px;text-align:right;margin:0" title="Click to edit" data-bind="value:filename"><span style="font-size:17px" data-bind="visible:variant().ext.length<2,text:variant().ext[0]"></span><select data-bind="visible:variant().ext.length>1, options:variant().ext, value:fileext"></select><br>'+
		'<br><div class="sectiontitle"><img src="img/gear2.png"><span>Options</span></div>'+
		'<input type="checkbox" data-bind="checked:inclancestral"> Include ancestral node data'+
		//'  <input type="checkbox" data-bind="visible:curitem().interlace,checked:interlaced"><span class="label" title="Interlace sequence data rows" data-bind="visible:curitem().interlace">Interlaced</span>'+
		'<div data-bind="slidevisible:category().name.indexOf(\'Seq\')!=-1">&nbsp;Mark masked sequence with <select data-bind="options:maskoptions,value:masksymbol"></select><br>'+
		'<input type="checkbox" data-bind="checked:inclhidden" disabled>Include hidden columns </div></div>');
		var makebtn = $('<a class="button" data-bind="visibility:format">Make file</a>');
		makebtn.click(function(){ parseexport(); });
		var frontwindow = makewindow("Export data",frontcontent,{icn:'export.png',id:'exportwindow',flipside:'front',btn:makebtn},exportwrap);
		var backcontent = $('<div class="sectiontitle"><img src="img/file.png"><span data-bind="text:filename()+fileext()"></span></div>'+
		'<div class="insidediv" style="max-width:400px;max-height:150px;overflow:auto"><div class="paper"></div></div>');
		var backbtn = $('<a class="button" style="padding-left:17px;margin-top:25px">&#x25C0; Back</a>');
		backbtn.click(function(){ $("#exportwrap").removeClass('flipped') });
		var downloadbtn = $('<a class="button" style="margin-left:40px;margin-top:25px" data-bind="visible:fileurl,attr:{href:fileurl}">Download</a>');
		var backwindow = makewindow("Export data",[backcontent,backbtn,downloadbtn],{icn:'export.png',id:'exportedwindow',flipside:'back'},exportwrap);
		ko.applyBindings(exportmodel,exportwrap[0]);
	}
	else if(type=='info'){
		if($("#infowindow").length>0){ $("#infowindow").trigger('mousedown');  return; } //bring window to front
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
		var dialogdiv = makewindow("Data information",[list],{btn:'OK',icn:'info.png',id:'infowindow'});
		ko.applyBindings(model,dialogdiv[0]);
	}
	else if(type=='align'){
		//var expbtn = $('<img src="img/plus.png" class="icn optadd">');
		var expbtn = $('<span class="rotateable texticn">&#x2295;</span>');
		expbtn.click(function(e){
			e.stopPropagation(); self = $(this);
			var expdiv = self.parent().next(".insidediv");
			if(expdiv.css('display')=='none'){ if(self.hasClass('rotateable')) self.addClass('rotated'); expdiv.slideDown(); infospan.fadeIn(); }
			else{ if(self.hasClass('rotateable')) self.removeClass('rotated'); expdiv.slideUp(); infospan.fadeOut(); }
		});
		var opttitlespan = $('<span class="actiontxt" title="Click to toggle options">Alignment options</span>').click(function(){expbtn.click()});
		var infospan = $('<span class="note" style="display:none;margin-left:20px">Hover options for description</span>');
		var nameinput = $('<input type="text" class="hidden" value="Prank alignment" title="Click to edit">');
		var namespan = $('<span class="note">Descriptive name: </span>').append(nameinput);
		var opttitle = $('<div>').append(expbtn,opttitlespan,infospan);
		var optdiv = $('<div class="insidediv" style="display:none">');
		var treecheck = model.treesource()?'':'checked="checked"';
		var parentoption = model.parentid()?'<option value="sibling" checked="checked">branch parent</option>':'';
		var writetarget = model.currentid()?'Aligned data will <select name="writemode">'+parentoption+
		'<option value="child" '+(model.parentid()?'':'checked="checked"')+'>branch current</option>'+
		'<option value="overwrite">overwrite current</option></select> analysis files in the <a onclick="dialog(\'library\')">library</a>.<br><br>':'';
		var optform = $('<form id="alignoptform" onsubmit="return false">'+writetarget+
		'<input type="checkbox" name="newtree" data-bind="enable:treesource" '+treecheck+'><span class="label" title="Checking this option builds a new guidetree for the sequence alignment process (otherwise uses the current tree).">make new tree</span>'+
		'<br><input type="checkbox" checked="checked" name="anchor"><span class="label" title="Use Exonerate anchoring to speed up alignment">alignment anchoring</span> '+
		'<br><input type="checkbox" name="e"><span class="label" title="Checking this option keeps current alignment intact (pre-aligned sequences) and only adds sequences for ancestral nodes.">keep current alignment</span>'+
		'<br><br><div class="sectiontitle"><span>Model parameters</span></div>'+
		'<input type="checkbox" checked="checked" name="F"><span class="label" title="Enabling this option is generally beneficial but may cause an excess of gaps if the guide tree is incorrect">trust insertions (+F)</span>'+
		'<br><span class="label" title="Gap opening rate">gap rate</span> <input type="text" name="gaprate" style="width:50px" data-bind="value:gaprate">'+
		' <span class="label" title="Gap length">gap length</span> <input type="text" name="gapext" data-bind="value:gapext">'+
		' <span class="label" title="Κ defines the ts/tv rate ratio for the HKY model that is used to compute the substitution scores for DNA alignments" data-bind="visible:isdna">K</span> <input type="text" name="kappa" data-bind="visible:isdna">'+
		'<br><span class="label" title="Default values are empirical, based on the input data." data-bind="visible:isdna">DNA base frequencies</span> <input type="text" name="A" placeholder="A" data-bind="visible:isdna"><input type="text" name="C" placeholder="C" data-bind="visible:isdna"><input type="text" name="G" placeholder="G" data-bind="visible:isdna"><input type="text" name="T" placeholder="T" data-bind="visible:isdna"><input type="hidden" name="dots" value="true"></form>');
		optdiv.append(optform);
		var alignbtn = $('<a class="button">Start alignment</a>');
		alignbtn.click(function(){ sendjob({form:optform[0],btn:alignbtn,statusdiv:{div:optdiv,title:opttitle},name:nameinput.val()}); });
		var dialogdiv = makewindow("Make alignment",['Current sequence data will be aligned with <a href="http://www.ebi.ac.uk/goldman-srv/prank" target="_blank">Prank</a> aligner.<br><hr>',namespan,opttitle,optdiv,'<br>'],{btn:alignbtn});
		ko.applyBindings(model,dialogdiv[0]);
	}
	else if(type=='jobstatus'){
		communicate('alignstatus','','jobdata'); //refresh data
		if($("#jobstatus").length>0){ $("#jobstatus").trigger('mousedown');  return; } //bring window to front
		var treenote = 'The tree phylogeny has been changed and the sequence alignment needs to be updated to reflect the new tree. You can realign the sequence or revert the tree modifications.<br><a class="button square red" onclick="model.selectundo(\'firsttree\'); model.undo();">Revert</a>';
		var notediv = $('<div class="sectiontitle" data-bind="visible:treealtered"><img src="img/info.png"><span>Notifications</span></div><div data-bind="visible:treealtered" class="sectiontxt">'+treenote+'</div>');
		var realignbtn = $('<a class="button square">Realign</a>');
		var optform = model.currentid()? $('<form id="realignoptform" onsubmit="return false">The realignment will <select name="writemode">'+
		(model.parentid()?'<option value="sibling" checked="checked">branch parent</option>':'')+
		'<option value="child" '+(model.parentid()?'':'checked="checked"')+'>branch current</option>'+
		'<option value="overwrite">overwrite current</option></select> analysis files in the <a onclick="dialog(\'library\')">library</a>.</form>') : [''];
		notediv.last().append(realignbtn,optform);
		realignbtn.click(function(){ sendjob({form:optform[0],btn:realignbtn,name:'Realignment',realign:true}) });
		var jobslistdiv = '<div class="sectiontitle" data-bind="visible:sortedjobs().length>0"><img src="img/run.png"><span>Status of background alignment jobs</span></div><div class="insidediv" data-bind="visible:sortedjobs().length>0,foreach:{data:sortedjobs,afterAdd:additem}"><div class="itemdiv" data-bind="html:html"></div><div class="insidediv logdiv"></div><hr></div>';
		var statuswindowdiv = makewindow("Status overview",[notediv,jobslistdiv],{id:"jobstatus",icn:'gear.png'});
		ko.applyBindings(model,statuswindowdiv[0]);
	}
	else if(type=='library'){
		communicate('getmeta','','analysdata');
		if($("#library").length>0){ $("#library").trigger('mousedown');  return; }
		var contentdiv = $('<div class="insidediv" data-bind="foreach:{data:sortedanalys,afterAdd:additem,beforeRemove:removeitem}"><div class="itemdiv" data-bind="html:html,style:{height:divh},css:{activeitem:isactive}"></div><div class="insidediv logdiv"></div><hr></div>');
		var header = ['<span class="dirtrail" data-bind="html:libdir"></span>','<span style="position:absolute;top:6px;right:15px;"><span class="fade" style="left:-35px"></span>Sort by: <select data-bind="options:sortanalysopt,optionsText:\'t\',optionsValue:\'v\',value:sortanalysby"></select></span>'];
		var librarywindowdiv = makewindow("Library of analyses",[contentdiv],{id:"library",header:header,icn:'library.png'});
		ko.applyBindings(model,librarywindowdiv[0]);
	}
	else if(type=='removeitem'||type=='terminate'){
		var btn = options.btn;
		var jobbtn = btn.title.indexOf('job')==-1 ? false : true;
		var afterfunc = jobbtn ? function(){ communicate('alignstatus','','jobdata'); } : function(){ communicate('getmeta','','analysdata'); };
		var action = type=='terminate' ? 'terminate' : 'rmdir';
		var startlabel = type=='terminate'? 'Stop' : 'Delete';
		if(btn.innerHTML==startlabel && !jobbtn){
			btn.innerHTML = 'Confirm';
			setTimeout(function(){ btn.innerHTML=startlabel; },5000);
		}else{
			communicate(action,{id:options.id},{btn:btn,func:afterfunc});
			if(action=='rmdir' && options.id==model.currentid()) model.currentid('');
		}
	}
}

//submit an alignment job
function sendjob(options){
	var alignbtn = options.btn, optdiv=false, opttitle='';
	if(options.statusdiv){ optdiv = options.statusdiv.div; opttitle = options.statusdiv.title; }
	var formdata = options.form? new FormData(options.form) : new FormData();
	formdata.append('name',options.name||'alignment');
	formdata.append('action','startalign');
	formdata.append('fasta',parseexport('fasta'));
	if(options.realign) formdata.append('realign','true');
	if(model.currentid()) formdata.append('id',model.currentid());
	if(model.parentid()) formdata.append('parentid',model.parentid());
	if(options.realign || (!$.isEmptyObject(treesvg) && !options.form['newtree']['checked'])) formdata.append('newick',parseexport('newick',{tags:true}));
	$.ajax({
    	url: 'backend.php',
    	type: 'POST',
        beforeSend: function(){
        	alignbtn.html('Sending job');
        	alignbtn.css({'opacity':0.6,'cursor':'default'});
        	alignbtn.unbind('click');
        },
        success: function(data){  //job sent to server. Show status.
          	if(optdiv){
        		optdiv.slideUp();
        		var job = JSON.parse(data);
        		optdiv.empty().append('<b>Alignment job started</b><br>');
        		optdiv.append('<div>Job ID: '+job.id+'<br>Started: '+msectodate(job.starttime)+'</div>');
        		optdiv.next().after('<span class="note">Job status can be followed via toolbar.</span>');
        		optdiv.slideDown();
        		setTimeout(function(){
        			opttitle.html('<img class="icn" src="img/info.png"> Status of alignment job');
        			opttitle.css('cursor','default');
        			alignbtn.html('OK');
        			alignbtn.css({'opacity':1,'cursor':'pointer'});
        			alignbtn.closest("div.popupwindow").find("img.closebtn").click();
        		},500);
        	}
        	setTimeout(function(){ communicate('alignstatus','','jobdata'); if(options.realign) model.treealtered(false); }, 600);
        },
        error: function(xhrobj,status,msg){
        	if(status=='OK' && xhrobj.responseText){ this.success(xhrobj.responseText); return; }
        	alignbtn.html('Failed <img src="img/help.png" title="'+msg+'" class="icn">');
        	//console.log('Alignment job error: '+status+'|'+msg); if(xhrobj.responseText){ console.log(xhrobj.responseText); }
        },
        data: formdata,
        dataType: "text",
        cache: false,
        contentType: false,
        processData: false
    });
    var oldjobcount = serverdata['jobdata']().length;
    setTimeout(function(){
    	if(serverdata['jobdata']().length==oldjobcount){ communicate('alignstatus','','jobdata'); }//no update made, fetch data update
    	if(optdiv) alignbtn.closest("div.popupwindow").find("img.closebtn").click(); //close alignment setup winow
    },5000);
}

//get sorted items from serverdata
function sortdata(data,key){
	if(!data) data = 'jobdata';
	if(!key) key = 'starttime';
	var itemsarray = typeof(data)=='string'? serverdata[data]() : data;
	itemsarray.sort(function(a,b){ return a[key]&&b[key]? a[key]()>b[key]()?1:-1 : 0; });
	return itemsarray;
}

/* Validation of files in import dialog */
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
            			//if(myXhr.upload) //myXhr.upload.addEventListener('progress',uploadprogress, false); //upload progress
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
        					parseimport({dialog:infodiv});
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
	  if(action.indexOf('import')!=-1){ //get files from local server
	  	var uploadbtn = $(infodiv);
	  	uploadbtn.html('Importing files');
        uploadbtn.css({'opacity':0.6,'cursor':'default'});
        uploadbtn.unbind('click');
        filescontent = {};
	  	$.each(filearr,function(i,file){
	  		var jobid = action.split(':')[1];
	  		$.ajax({
				type: "GET",
				url: file.url,
    			dataType: "text",
    			success: function(data){
    				filescontent[file.name] = (data);
        			if(Object.keys(filescontent).length==goodfilecount){//all files have been read in. Go parse.
        				uploadbtn.html('Files imported');
        				var result = parseimport({dialog:uploadbtn});//import files&hide statuswindow
        				if(result){ //import succeeded: send confirmation to server
        					model.currentid(jobid);
        					communicate('writemeta',{id:jobid,key:'imported'});
        					communicate('alignstatus','','jobdata');
        					communicate('getmeta','','analysdata');
        					setTimeout(function(){ $("#library .closebtn").click() },2000);
        				}
        			}
    			},
    			trycount : 0,
    			error: function(xhrobj,status,msg){ 
        			if(!msg&&status!="abort"){//no response. try again
        				if(this.trycount<1){ this.trycount++; setTimeout(function(){$.ajax(this)},1000); return; }
        				else{ msg = 'No response from server' }
        			}
        			uploadbtn.html('Server error <img src="img/help.png" title="'+msg+'" class="icn">');
        			console.log('Server error: '+status+'|'+msg);
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
    					if(Object.keys(filescontent).length==goodfilecount){ uploadbtn.html('Files imported'); parseimport({dialog:infodiv}) }
    				};  
    				reader.readAsText(file);
    			}
    		});
		}) 
	  }
	} else { var uploadbtn = '' }
	
  if(action.indexOf('import')==-1){ //files from filebrowser. Flip the window.
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
    if(e.lengthComputable) console.log(parseInt((e.loaded/e.total)*100)+'%');
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

/* Initiation on page load */
$(function(){
	dom = { seqwindow:$("#seqwindow"),seq:$("#seq"),wrap:$("#wrap"),treewrap:$("#treewrap"),tree:$("#tree"),names:$("#names") }; //glob.ref. to dom elements
	ko.applyBindings(model);
	
	$("#zoombtns").hover(function(){$("#zoomperc").fadeIn()},function(){$("#zoomperc").fadeOut()});
	$("#treebin div").append(svgicon('trash'));
	
	var $left = $("#left");
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
			dom.tree.css('right',133-dragger.position.left);
			dom.names.css('width',133-dragger.position.left);
		}
	});
	$("#namesborderDrag").hover(
		function(){$("#names").css('border-color','#aaa')},
		function(){$("#names").css('border-color','white')}
	);
	
	$("#names").mouseleave(function(e){ rowborder(e,'hide'); });
	
	//Add mouse click/move listeners to sequence window
	dom.seqwindow.mousedown(function(e){
	 e.preventDefault();//disable image drag etc.
	 var startpos = {x:e.pageX,y:e.pageY};
	 if(e.pageY>dom.seqwindow.offset().top+30){//in seq area
	  if(e.which==1 && e.target.tagName!='DIV'){//act on left mouse button, outside of selections
		var curid = lastselectionid;
		dom.seqwindow.mousemove(function(evt){ selectionsize(evt,curid,startpos); });
		dom.seqwindow.mouseup(function(e){
	 		if(e.pageY>dom.seqwindow.offset().top+30){//in seq area
	  			if(e.which==1 && e.target.tagName!='DIV' && $("div.canvasmenu").length==0){ //outside of selections
	  				var dx = e.pageX-startpos.x; var dy = e.pageY-startpos.y; 
	  				if(Math.sqrt(dx*dx+dy*dy)<10){ //no drag: infobubble
	  					var sdata = seqinfo(e);
	  					var arrtype = e.pageY-dom.seqwindow.offset().top>dom.seqwindow.innerHeight()-90? 'bottom' : 'top';
	  					rowborder(sdata);
	  					tooltip(e,sdata.content,{container:"#seq",arrow:arrtype,target:sdata});
	  				}
	  			}
	 		}
	 		dom.seqwindow.unbind('mouseup');
		});
	  }
	 }
	});
	
	$("html").mouseup(function(){ dom.seqwindow.unbind('mousemove'); });
	
	dom.seqwindow.bind('contextmenu',function(e){//right click
		e.preventDefault();//disable right-click menu
		hidetooltip();
		var maskcount = 0;
		for(var c=0;c<maskedcols.length;c++){ if(maskedcols[c]){ maskcount++; } }
		if($('div[id^="selection"]').length==0){//no selections made
			var menudata = {
				'Mask all sequences' : {'click':function(){ maskdata(false,false,'maskall') },
	  				'submenu':{ 'Unamask all sequences': function(){ maskdata(false,false,'unmaskall') }}}
			};
			var hrowsmenu = { 'Reveal all hidden rows' : function(){console.log('reveal all rows')}};
			if(model.hiddenlen()>0){ menudata['Reveal '+model.hiddenlen()+' columns'] = {'click':function(){ console.log('uncollapse columns') },'submenu':hrowsmenu }; }
			else menudata['Reveal all hidden rows'] = hrowsmenu['Reveal all hidden rows'];
			if(maskcount>0) menudata['Collapse '+maskcount+' masked columns'] = function(){ maskdata(e,false,'hidemaskedcols') };
			tooltip(e,'',{data:menudata});
		}
		else {
	  	  var data = {};
	  	  var mode = model.selmode();
	  	  var over = e.target.id=='' ? e.target.parentNode : e.target;	
	  	  activeid = over.id.indexOf('selection')!=-1||over.id.indexOf('cross')!=-1 ? over.id.substr(9) : false;
	  	  var curactiveid = activeid;
	  	  
	  	  if(mode=='default'||mode=='columns'){//construct right-click dropmenus for sequence area
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
	  	  	$("#seq div[class^='selection']").css({'border-color':'','color':''});
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
	  	  tooltip(e,'',{data:data});
	   }
	});
		
	$.ajax({ //get initial datafile
		type: "GET",
		url: "data/"+model.startfile,
    	dataType: "text",
    	success: function(data){
    		filescontent = {};
    		filescontent[model.startfile] = data;
    		parseimport();
    	}
	});
	
	communicate('alignstatus','','jobdata'); //get data from server
	communicate('getmeta','','analysdata');
});