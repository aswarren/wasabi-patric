var end,now,start = new Date().getTime();

var seqlen = 0;
var datarows = [];
var filerows = [];
var unknown = [];
var colstep = 200;
var rowstep = 60;
var alphabet = '-.AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz?'.split('');
var lettercount = alphabet.length;
var colors = {'-':['#ccc','#fff'],'.':['#aaa','#fff']};
for(var index=2;index<(alphabet.length-1);index++){ colors[alphabet[index]] = rainbow(lettercount,index); } //make colors
colors['?'] = ['#f00','#fff'];

var myModel = function(startzoom){
	this.zoomlevel = ko.observable(startzoom);
	this.boxw = ko.computed(function(){ return parseInt(this.zoomlevel()*1.5); },this);
	this.boxh = ko.computed(function(){ return parseInt(this.zoomlevel()*2); },this);
	this.fontsize = ko.computed(function(){ return parseInt(this.zoomlevel()*1.8); },this);
}
var model = new myModel(10);

var used = {};
function parseXml(xml){
	var tmpseq = '';
   	$(xml).find("leaf").each(function(){
   		tmpseq = $(this).find("sequence").text();
   		tmpseq = tmpseq.replace(/^\s+|\s+$/g,'');//remove leading&trailing whitespace
   		filerows.push({name: $(this).attr("name"), sequence: tmpseq.split('')});
   		datarows.push({name: $(this).attr("name"), sequence: []});
   	});
   	$.each(filerows,function(i,row){
   		if(row.sequence.length > seqlen){ seqlen = row.sequence.length; }
   		var s,lindex;
   		for(var j=0;j<row.sequence.length;j++){
   			s = row.sequence[j];
   			lindex = $.inArray(s,alphabet);
   			if(!used[s]){used[s] = lindex;}
   			if(lindex == -1){//get non-alphabet letters
   				if($.inArray(s,unknown)==-1){ unknown.push(s); }
   				datarows[i].sequence.push(alphabet.length-1);//='?'
 				lettercount++;
   			} else { datarows[i].sequence.push(lindex); }
   		}
   	});
   	now = new Date().getTime();
   	console.log('AJAX: '+datarows.length+'x'+seqlen+' letters ('+(now-start)+'ms)'); end = now;
   	redraw();
}

var first = true;
function redraw(){
	canvaspos = [];
	seq.empty();
	seq.css({ 'width':seqlen*model.boxw(), 'height':datarows.length*model.boxh() });
	makeRuler();
	makeCanvases(); makeImage();
	if(first){ mCustomScrollbar(500,"easeOutCirc","auto","yes","yes",10); } else { $(window).trigger('resize'); }
	first = false;
}

var canvases = [];
var canvases2 = {};
function makeCanvases(){
	var tmpel,tmpcanv,letterw,maxletterw;
	canvases = {};
	$.each(alphabet,function(lindex,letter){
		tmpel = document.createElement('canvas');
		tmpel.width = model.boxw();
		tmpel.height = model.boxh();
		tmpcanv = tmpel.getContext('2d');
		tmpcanv.fillStyle = colors[letter][1];
		if(model.zoomlevel()==1){ tmpcanv.fillRect(0,0,1,2); }
		else{ tmpcanv.fillRect(1,1,tmpel.width-1,tmpel.height-1); }
		if(model.fontsize() > 7){
			tmpcanv.font = model.fontsize()+"px monospace";
			tmpcanv.textAlign = 'center';
			tmpcanv.textBaseline = 'middle';
			tmpcanv.fillStyle = colors[letter][0];
			tmpcanv.fillText(letter,tmpel.width/2+1,tmpel.height/2);
		}
		canvases[lindex] = tmpel;
		if(!isNaN(used[letter])){ canvases2[letter]=tmpel; }
	});
	now = new Date().getTime();
	console.log('makeCanvases: '+(now-end)+'ms'); end = now;
	$.each(canvases2,function(i,canvel){$('#top').append(i+':',canvel)})
}

var canvaspos = [];
function makeImage(){
	var colstartpix = parseInt((0-wrap.position().left)/model.boxw());
	var colstart = colstartpix-(colstartpix%colstep); //snap to (colstep-paced) tile grid
	var colend = parseInt((seqwindow.innerWidth()-wrap.position().left)/model.boxw());
	if(colend>seqlen){ colend = seqlen; }
	var rowstartpix = parseInt((0-parseInt(seq.css('margin-top')))/model.boxh());
	var rowstart = rowstartpix-(rowstartpix%rowstep); //snap to grid
	var rowend = parseInt(((seqwindow.innerHeight()-ruler.outerHeight())-parseInt(seq.css('margin-top')))/model.boxh());
	if(rowend>datarows.length){ rowend = datarows.length; }
	var rowdraws = [];
	
	for(var row = rowstart; row<rowend; row+=rowstep){
	  for(var col = colstart; col<colend; col+=colstep){
	  //console.log('inArray: '+row+'@'+$.inArray(row,canvaspos.y)+' '+col+'@'+$.inArray(col,canvaspos.x));
		if($.inArray(row+'|'+col,canvaspos) == -1){ //canvas not yet made
			canvaspos.push(row+'|'+col);
			rowdraws[row+'|'+col] = {};
			rowdraws[row+'|'+col].canvasrow = row;
			rowdraws[row+'|'+col].row = row;
			rowdraws[row+'|'+col].col = col;
			setTimeout(function(r,c){ return function(){
				var canvas = document.createElement('canvas');
				var div = document.createElement('div');
				canvas.width = colstep*model.boxw();
				canvas.height = rowstep*model.boxh();
				var endrow = rowdraws[r+'|'+c].row+rowstep>datarows.length ? datarows.length : rowdraws[r+'|'+c].row+rowstep;
				console.log('NEW CANVAS: startrow: '+r+' endrow: '+endrow+' startcol: '+c+' dimensions: '+canvas.width+'x'+canvas.height);
				rowdraws[r+'|'+c].start = new Date().getTime();
				canvas.setAttribute('id',r+'|'+c);
				var canv = canvas.getContext('2d');
				canv.clearRect(0,0,canvas.width,canvas.height);
				var lindex;
				while(rowdraws[r+'|'+c].canvasrow < endrow){
					var data = filerows[rowdraws[r+'|'+c].canvasrow].sequence;
					var endcol = rowdraws[r+'|'+c].col+colstep>data.length ? data.length : rowdraws[r+'|'+c].col+colstep;
					for(var canvascol=c;canvascol<endcol;canvascol++){
						//lindex = data[canvascol];
						letter = data[canvascol];
						if(canvascol>endcol&&rowdraws[r+'|'+c].canvasrow==2){ console.log('endcol '+canvascol); return false; }
						canv.drawImage( canvases2[letter], (canvascol - rowdraws[r+'|'+c].col)*model.boxw()+1, (rowdraws[r+'|'+c].canvasrow - rowdraws[r+'|'+c].row)*model.boxh()+1);
					}
					rowdraws[r+'|'+c].canvasrow++;
				}
				$(div).css({'left': c*model.boxw()+'px', 'top': r*model.boxh()+'px'});
				seq.append(div);
				$(div).append(canvas);
				var now = new Date().getTime(); console.log('END: endrow:'+rowdraws[r+'|'+c].canvasrow+' ('+(now-rowdraws[r+'|'+c].start)+'ms)');
				rowdraws[r+'|'+c] = {};
			}}(row,col),10);
		}//make canvas	
	  }//for cols
	}//for rows
}


function makeRuler(){
	var tick = 10;
	var tickw = tick*model.boxw()-4;
	var k,spans = '';
	for(var t=0;t<=seqlen;t+=tick){
		k = t;
		if(model.boxw()<4){ if(t%100==0){ if(t>=1000){ k = '<span>'+(t/1000)+'K</span>'; }else{ k = '<span>'+t+'</span>'; } }else{ k = '&nbsp;'; } }
		spans += '<span style="width:'+tickw+'px">'+k+'</span>';
	}
	ruler.html(spans);
}

function zoomin(){
	if(model.zoomlevel()<20){ model.zoomlevel(model.zoomlevel()+2); redraw(); }
	console.log('zoom: '+model.zoomlevel());
}
function zoomout(){
	if(model.zoomlevel()>3){ model.zoomlevel(model.zoomlevel()-2); redraw(); }
	console.log('zoom: '+model.zoomlevel());
}


//color palette: http://jsfiddle.net/k8NC2/1/  jalview color schemes
function rainbow(numOfSteps, step){
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
    var c = "#" + ("00" + (~ ~(r * 255)).toString(16)).slice(-2) + ("00" + (~ ~(g * 255)).toString(16)).slice(-2) + ("00" + (~ ~(b * 255)).toString(16)).slice(-2);
    return ['#333',c];
}


$(function(){
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
	
	ko.applyBindings(myModel);
	
	var $left = $("#left");
	var $border = $("#leftborder");
	var $right = $("#right");
	$("#borderDrag").draggable({ 
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
	
	$.ajax({
		type: "GET",
		url: "../data.xml",
    	dataType: "xml",
    	success: parseXml
	});
});