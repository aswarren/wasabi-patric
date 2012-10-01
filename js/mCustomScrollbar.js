var right,seqwindow,wrap,seq,seqwrap,ruler,verticalDragger_container,verticalDragger,scrollUpBtn,scrollDownBtn,horizontalDragger_container,horizontalDragger,scrollLeftBtn,scrollRightBtn,canvasload,spinner,treewrap;

/* function to fix the -10000 pixel limit of jquery.animate */
$.fx.prototype.cur = function(){
	if ( this.elem[this.prop] != null && (!this.elem.style || this.elem.style[this.prop] == null) ) {
		return this.elem[ this.prop ];
	}
	var r = parseFloat( jQuery.css( this.elem, this.prop ) );
	return typeof r == 'undefined' ? 0 : r;
} 

/* malihu custom scrollbar plugin - http://manos.malihu.gr (rewritten by Andres Veidenberg)
function parameters:
1) scroll easing amount (0 for no easing)
2) scroll easing type
3) scrollbar height/width adjustment (values: "auto" or "fixed")
4) mouse-wheel support (values: "yes" or "no")
5) scrolling via buttons support (values: "yes" or "no")
6) buttons scrolling speed (values: 1-20, 1 being the slowest)
*/ 
function mCustomScrollbar(animSpeed,easeType,draggerDimType,mouseWheelSupport,scrollBtnsSupport,scrollBtnsSpeed){
	
	//get & store minimum dragger height & width (defined in css)
	if(!seqwindow.data("minDraggerHeight")){
		seqwindow.data("minDraggerHeight",verticalDragger.height());
	}
	if(!seqwindow.data("minDraggerWidth")){
		seqwindow.data("minDraggerWidth",horizontalDragger.width());
	}
	
	//get & store original content height & width
	if(!seqwindow.data("contentHeight")){
		seqwindow.data("contentHeight",seq.height());
	}
	if(!seqwindow.data("contentWidth")){
		seqwindow.data("contentWidth",wrap.width());
	}
	
	CustomScroller();
	
	function CustomScroller(reloadType){
		//horizontal scrolling ------------------------------
			var visibleWidth = seqwindow.innerWidth();
			var totalContentWidth = seq.width();
			if(totalContentWidth>visibleWidth){ //enable scrollbar if content is long
				horizontalDragger.css("display","block");
				if(reloadType!="resize" && totalContentWidth != seqwindow.data("contentWidth")){
					horizontalDragger.css("left", 0);
					wrap.css("left", 0);
					seqwindow.data("contentWidth", totalContentWidth);
				}
				horizontalDragger_container.css("display","block");
				scrollLeftBtn.css("display","block");
				scrollRightBtn.css("display","block");
				var minDraggerWidth = seqwindow.data("minDraggerWidth");
				var draggerContainerWidth = horizontalDragger_container.width();
		
				function AdjustDraggerWidth(){
					if(draggerDimType=="auto"){
						var adjDraggerWidth = Math.round((visibleWidth/totalContentWidth)*draggerContainerWidth); //adjust dragger width analogous to content
						if(adjDraggerWidth<=minDraggerWidth){ //minimum dragger width
							horizontalDragger.css("width",minDraggerWidth+"px");
						} else {
							horizontalDragger.css("width",adjDraggerWidth+"px");
						}
					}
				}
				AdjustDraggerWidth();
				var draggerWidth = horizontalDragger.width();
				var draggerXMax = draggerContainerWidth-draggerWidth;
				horizontalDragger.draggable({ 
					axis: "x", 
					containment: [horizontalDragger_container.offset().left,0,horizontalDragger_container.offset().left+draggerXMax], 
					drag: function(event, ui) {
						ScrollX(false,'drag');
					}, 
					stop: function(event, ui) {
						horizontalDraggerRelease();
					}
				});
			
				horizontalDragger_container.click(function(e) {
					var mouseCoord=(e.pageX - $(this).offset().left);
					if(mouseCoord<horizontalDragger.position().left || mouseCoord>(horizontalDragger.position().left+draggerWidth)){
						var targetPos=mouseCoord+draggerWidth;
						if(targetPos<draggerContainerWidth){
							horizontalDragger.css("left",mouseCoord);
							ScrollX(false,'click');
						} else {
							horizontalDragger.css("left",draggerXMax);
							ScrollX(false,'click');
						}
					}
				});
				
				//scroll buttons
				if(scrollBtnsSupport=="yes"){
					scrollLeftBtn.click(function(e){ e.stopPropagation(); ScrollX(0-visibleWidth,'leftbtn'); });
					scrollRightBtn.click(function(e){ e.stopPropagation(); ScrollX(visibleWidth,'rightbtn'); });
				}

				//scroll
				var scrollXAmount = (totalContentWidth-visibleWidth)/draggerXMax;
				horizontalDragger.css("left", (0-wrap.position().left)/scrollXAmount);
				
				//drag by ruler
				var wrapoffset = wrap.offset().left;
				wrap.draggable({
					handle: "#ruler",
					axis: "x",
					start: function(e, ui) { draginertia.start(0-totalContentWidth+visibleWidth, scrollXAmount, ui.position.left, e.timeStamp) },
					drag: function(e, ui){
						draginertia.add(ui.position.left, e.timeStamp);
						horizontalDragger.css("left",(0-ui.position.left)/scrollXAmount); 
					},
       				stop: function(e, ui) { draginertia.end(e.timeStamp); } 
				});
			} else { //disable scrollbar if content is short
				horizontalDragger.css("left",0).css("display","none"); //reset content scroll
				wrap.css("left",0);
				horizontalDragger_container.css("display","none");
				scrollLeftBtn.css("display","none");
				scrollRightBtn.css("display","none");
			}
			
		//vertical scrolling ------------------------------
			var visibleHeight = seqwindow.innerHeight()-ruler.outerHeight()-parseInt(seqwrap.css('margin-top'));
			var totalContentHeight = seq.height()+10;
			if(totalContentHeight>visibleHeight){ //enable scrollbar if content is long
				verticalDragger.css("display","block");
				if(reloadType!="resize" && totalContentHeight != seqwindow.data("contentHeight")){
					verticalDragger.css("top",0);
					seq.css("margin-top",0);
					seqwindow.data("contentHeight",totalContentHeight);
				}
				verticalDragger_container.css("display","block");
				scrollDownBtn.css("display","block");
				scrollUpBtn.css("display","block");
				var minDraggerHeight = seqwindow.data("minDraggerHeight");
				var draggerContainerHeight = verticalDragger_container.height();
		
				function AdjustDraggerHeight(){
					if(draggerDimType=="auto"){
						var adjDraggerHeight = Math.round((visibleHeight/totalContentHeight)*draggerContainerHeight); //adjust dragger height analogous to content
						if(adjDraggerHeight<=minDraggerHeight){ //minimum dragger height
							verticalDragger.css("height",minDraggerHeight+"px").css("line-height",minDraggerHeight+"px");
						} else {
							verticalDragger.css("height",adjDraggerHeight+"px").css("line-height",adjDraggerHeight+"px");
						}
					}
				}
				AdjustDraggerHeight();
				var draggerHeight = verticalDragger.height();
				var draggerYMax = draggerContainerHeight - draggerHeight;
				
				verticalDragger.draggable({ 
					axis: "y", 
					containment: [0,verticalDragger_container.offset().top,0,verticalDragger_container.offset().top+draggerYMax], 
					drag: function(event, ui) {
						ScrollY(false,'drag');
					}, 
					stop: function(event, ui) {
						verticalDraggerRelease();
					}
				});
				
				verticalDragger_container.click(function(e) {
					var mouseCoord = (e.pageY - $(this).offset().top);
					if(mouseCoord < verticalDragger.position().top || mouseCoord>(verticalDragger.position().top+draggerHeight)){
						var targetPos = mouseCoord+draggerHeight;
						if(targetPos < draggerContainerHeight){
							verticalDragger.css("top",mouseCoord);
							ScrollY(false,'click');
						} else {
							verticalDragger.css("top",draggerYMax);
							ScrollY(false,'click');
						}
					}
				});

				//scroll buttons
				if(scrollBtnsSupport=="yes"){
					scrollDownBtn.click(function(e){ e.stopPropagation(); ScrollY(visibleHeight,'downbtn'); });
					scrollUpBtn.click(function(e){ e.stopPropagation(); ScrollY(0-visibleHeight,'upbtn'); });
				}

				var scrollYAmount = (totalContentHeight-visibleHeight)/draggerYMax;
				verticalDragger.css("top", (0-parseInt(seq.css('margin-top')))/scrollYAmount);
			} else { //disable scrollbar if content is short
				verticalDragger.css("top",0).css("display","none"); //reset content scroll
				seq.css("margin-top",0);
				verticalDragger_container.css("display","none");
				scrollDownBtn.css("display","none");
				scrollUpBtn.css("display","none");
			}
		
		var scrollXTimer;
		function ScrollX(shift,id){
			var draggerX = horizontalDragger.position().left;
			var posX = parseInt(wrap.css('left'));
			if(shift){
				var target = posX-shift;
				var draggerPos = (0-target)/scrollXAmount;
				if(draggerPos<0){ draggerPos = 0; }else if(draggerPos>draggerXMax){ draggerPos = draggerXMax; }
				draggerPos = Math.round(draggerPos);
				horizontalDragger.css('left',draggerPos);
			}
			else{
				var target = Math.round(-draggerX*scrollXAmount);
			}
			if(target>0){ target = 0; }else if(Math.abs(target)>totalContentWidth-visibleWidth){ target = visibleWidth-totalContentWidth; }
			clearTimeout(scrollXTimer);
			scrollXTimer = setTimeout(function(){ makeImage('x:'+target);},100);
			wrap.stop().animate({left: target}, animSpeed, easeType);
		}
		var scrollYTimer;
		function ScrollY(shift,id){
			var draggerY = verticalDragger.position().top;
			var marginY = parseInt(seq.css('margin-top'));
			clearTimeout(scrollYTimer);
			scrollYTimer = setTimeout('makeImage()',100);
			if(shift){
				var target = marginY-shift;
				var draggerPos = (0-target)/scrollYAmount;
				if(draggerPos<0){ draggerPos = 0; }else if(draggerPos>draggerYMax){ draggerPos = draggerYMax; }
				draggerPos = Math.round(draggerPos);
				verticalDragger.css('top',draggerPos);
			}
			else{
				var target = Math.round(-draggerY*scrollYAmount);
			}
			clearTimeout(scrollYTimer);
			scrollYTimer = setTimeout(function(){ makeImage('y:'+target);},100);
			if(target>0){ target = 0; } else if(Math.abs(target)>totalContentHeight-visibleHeight){ target = visibleHeight-totalContentHeight; }
			seq.stop().animate({marginTop: target}, animSpeed, easeType);
			treewrap.stop().animate({top: target}, animSpeed, easeType);
			if($("#namelabel").css('display')=='block'){ //move name label extension when scrolling
				var target2 = $("#namelabel").position().top+target-marginY;
				$("#namelabel").stop().animate({top: target2}, animSpeed, easeType);
				var target3 = $("#tooltip").position().top+target-marginY;
				$("#tooltip").stop().animate({top: target3}, animSpeed, easeType);
			}
		}
				
		//mousewheel
		if(mouseWheelSupport=="yes"){
				$("#left, #seqwindow").off("mousewheel");
				$("#left, #seqwindow").on("mousewheel", function(event, delta, deltaX, deltaY) {
					event.preventDefault();
					if(deltaX){
						var velX = Math.abs(deltaX*10);
						horizontalDragger.css("left", horizontalDragger.position().left+(deltaX*velX));
						if(horizontalDragger.position().left<0){
							horizontalDragger.css("left", 0);
						}
						if(horizontalDragger.position().left>draggerXMax){
							horizontalDragger.css("left", draggerXMax);
						}
						ScrollX(false,'scroll');
					} else if(deltaY){
						var velY = Math.abs(deltaY*10);
						verticalDragger.css("top", verticalDragger.position().top-(deltaY*velY));
						if(verticalDragger.position().top<0){
							verticalDragger.css("top", 0);
						}
						else if(verticalDragger.position().top>draggerYMax){
							verticalDragger.css("top", draggerYMax);
						}
						ScrollY(false,'scroll');
					}
				});
		}
		
		horizontalDragger.mouseup(function(){
			horizontalDraggerRelease();
		}).mousedown(function(){
			horizontalDraggerPress();
		});
		verticalDragger.mouseup(function(){
			verticalDraggerRelease();
		}).mousedown(function(){
			verticalDraggerPress();
		});

		function horizontalDraggerPress(){
			horizontalDragger.addClass("dragger_pressed");
		}
		function verticalDraggerPress(){
			verticalDragger.addClass("dragger_pressed");
		}

		function horizontalDraggerRelease(){
			horizontalDragger.removeClass("dragger_pressed");
		}
		function verticalDraggerRelease(){
			verticalDragger.removeClass("dragger_pressed");
		}
	}
	
	var resizeTimer
	$(window).resize(function() {
		if(horizontalDragger.position().left>horizontalDragger_container.width()-horizontalDragger.width()){
			horizontalDragger.css("left", horizontalDragger_container.width()-horizontalDragger.width());
		}
		if(verticalDragger.position().top>verticalDragger_container.height()-verticalDragger.height()){
			verticalDragger.css("top", verticalDragger_container.height()-verticalDragger.height());
		}
		CustomScroller("resize");
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout('makeImage()',100);
	});
}

//adding inertia for ruler drag
var draginertia = new function(){  
    var amplify = 500;  //adjust momentum
    var stamps = [];
    var limit = 0;
    var draggeradj = 0;
    
    this.start = function(lim,adj,pos,time){ limit = lim; draggeradj = adj; stamps = [{pos:pos,time:time}]; };
    
    this.add = function(pos,time){ stamps.push({pos:pos,time:time}); if(stamps.length > 2){ stamps.shift() } };

    this.end = function(time){
    	stamps[1].time = time;        
        var distance = Math.abs(stamps[1].pos - stamps[0].pos);
        var time = stamps[1].time - stamps[0].time;
        var speed = distance/time;
        var inertia = speed > 0.02 ? Math.round(speed*amplify) : 0;
		var curpos = wrap.position().left;
        var endstop = stamps[0].pos>stamps[1].pos ? curpos-inertia : curpos+inertia;
        
        var easetype = 'easeOutCirc';
        if(endstop>0){ endstop = 0; easetype = 'easeOutBack'; }
        else if(endstop<limit){ endstop = limit; easetype = 'easeOutBack'; }
        
        wrap.stop().animate({ left:endstop+'px' }, 800, easetype);
        horizontalDragger.stop().animate({ left:0-(endstop/draggeradj)+'px' }, 800, easetype);
        setTimeout(function(){makeImage()},850);
    };

};