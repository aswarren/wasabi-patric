var counter = 0;
var leafs = [];
var rollstart = 0;
Smits = {};
Smits.Common = {
/// Global functions accessible by all data objects ///
	nodeIdIncrement : 0,
	activeNode: 0,
	
	/* Rounds float to a defined number of decimal places */
	roundFloat : function(num, digits){
		if(!digits) digits = 4;
		var i = 0, 
			dec = 1;
		while(i < digits){
			dec *= 10;
			i++;
		}
		return Math.round(num*dec)/dec; 
	},
	
	/* Copies properties from one object to another */
	apply : function(obj, extObj){
		if (obj && typeof extObj == 'object') {
			for (var key in extObj) {
				obj[key] = extObj[key];
			}
		}
		return obj;	
	},
	
	addRaphEventHandler : function(el, eventType, fn, paramsObj){
		try{
			el[eventType](function(fn, paramsObj){
				return function(e,o){
					var params = paramsObj;
					params.e = e;
					fn(params);
				};
			}(fn, paramsObj));
		} catch (err){}	
	},
	
	isInteger : function(s) {
		return !isNaN(parseInt(s));
	},

	isXMLSerializerAvailable : function(){
		if (typeof(XMLSerializer) == "function"){
			return true;
		} else {
			return false;
		}
	},
	
	createSvgEl : function (el, attr) {
		el = document.createElementNS("http://www.w3.org/2000/svg", el);            
		if (attr) {
			for (var key in attr) {
				if (attr.hasOwnProperty(key)) {
					el.setAttribute(key, String(attr[key]));
				}
			}
		}	
		return el;	
	},
	
	createGradientEl : function(name, obj, coords){
		if(obj.type != "radialGradient") return false;
		
		var radialEl = Smits.Common.createSvgEl("radialGradient", {
			id: name, 
			gradientUnits:"userSpaceOnUse", 
			cx: coords[0], 
			cy: coords[1], 
			r: coords[2], 
			fx: coords[0], 
			fy: coords[1]
		});

		if(obj.stop){
			var stop = obj.stop;
			for(var i = 0; i < stop.length; i++){
				var stopObj = stop[i];
				if(stopObj['@attributes']){
					radialEl.appendChild(Smits.Common.createSvgEl("stop", stopObj['@attributes']));
				} else {
					if(stopObj['_attributes']) delete stopObj['_attributes'];
					if(stopObj['_children']) delete stopObj['_children'];
					if(stopObj['__proto__']) delete stopObj['__proto__'];
					radialEl.appendChild(Smits.Common.createSvgEl("stop", stopObj));
				}
			}
		}
		
		return radialEl;
	},
	
	setCssStyle : function(selector, rule) {
		var stylesheet = document.styleSheets[0];
		if( stylesheet.addRule ){
			stylesheet.addRule(selector, rule);
		} else if( stylesheet.insertRule ){
			stylesheet.insertRule(selector + ' { ' + rule + ' }', stylesheet.cssRules.length);
		}
	}

};

Smits.PhyloCanvas = function(){
/// Master data object. Contains tree data, SVG canvas and rendered tree objects. ///
	return function(inputFormat, namesWidth, canvasWidth, canvasHeight, type){
		/* Privileged Methods */
		this.scale = function(multiplier){
			this.svg.svg.scale(multiplier);
		};
		this.getSvgSource = function(){
			if(Raphael.svg && Smits.Common.isXMLSerializerAvailable()){
				var serialize = new XMLSerializer();
				return serialize.serializeToString(svg.svg.canvas);
			} else { return false; }
		};
		this.refresh = function(type){
			var self = this;
			self.data.processLen();
			self.svg.svg1.clear(); self.svg.svg2.clear();
			setTimeout(function(){
				if(type == "circular"){
				//this.phylogram = new Smits.PhyloCanvas.Render.CircularPhylogram(this.svg, this.data);		
				}else{ self.phylogram = new Smits.PhyloCanvas.Render.Phylogram(self.svg, self.data); }
				redraw();
			},200); 
		}
	
		/* CONSTRUCTOR */
		// Process dataset - assume newick format
		if(typeof inputFormat === "object"){
			if(inputFormat.xml || inputFormat.phyloxml){
				this.data = new Smits.PhyloCanvas.PhyloxmlParse(xj);
			} else if(inputFormat.newick){
				this.data = new Smits.PhyloCanvas.NewickParse(inputFormat.newick);
			} else {
				console.log('PhyloSVG Error: Please set the format of input data');
			}
		} else {
			this.data = new Smits.PhyloCanvas.NewickParse(inputFormat);
		}
		this.svg = new Smits.PhyloCanvas.Render.SVG(namesWidth, canvasWidth, canvasHeight);
		
		/* FACTORY */
		if(type == "circular"){
			//this.phylogram = new Smits.PhyloCanvas.Render.CircularPhylogram(this.svg, this.data);		
		} else {
			this.phylogram = new Smits.PhyloCanvas.Render.Phylogram(this.svg, this.data);			
		}		
		
	}	
}();

Smits.PhyloCanvas.prototype = {
};

Smits.PhyloCanvas.Node = function(){
/// Node Class. Allows tree data objects to be traversed across children ///
	return function(parentInstance){
		// initiate object
		this.id = Smits.Common.nodeIdIncrement += 1;
		this.level = 0;
		this.len = 0.0001;
		this.lenFromRoot = 0;
		this.name = '';
		this.type = '';
		this.chart = {};
		this.img = [];
		this.parent = false;
		this.hidden = false;
		this.canvx = 0;
		this.canvy = 0;
		this.miny = 0;
		this.maxy = 0;

		/* Cache Calculations */
		this._countAllChildren = false;
		this._countImmediateChildren = false;
		this._midBranchPosition = false;
	
		this.children = new Array();
		
		if(parentInstance){
			this.parent = parentInstance;
		}
	}
}();

Smits.PhyloCanvas.Node.prototype = {
	/// Functions for every node instance ///
	clearChildrenCache : function(){ //clear count caches
		for (var key in this.children) {
			if(Smits.Common.isInteger(key)){
				var child = this.children[key];
				if(child.children && child.children.length > 0) child.clearChildrenCache();
				else child.edgeCircleHighlight = false;			
			}
		}
		this._countAllChildren = false;
		this._countAllHidden = false;
		this._countImmediateChildren = false;
		this._midBranchPosition = false;
		this.edgeCircleHighlight = false;
	},
	
	getCountAllChildren : function(){ //get number of visible descendant leaves
		//if( this._countAllChildren !== false ) return this._countAllChildren;
		var nodeCount = 0;
		
		if(!this.hidden){
		  for (var i in this.children) {
			var child = this.children[i];
			if(child.children && child.children.length > 0 && !child.hidden)  {
				nodeCount += child.getCountAllChildren();
			} else {
				if(!child.hidden){ nodeCount ++; }
			}			
		  }
		}
		this._countAllChildren = nodeCount;
		return nodeCount;
	},
	
	getCountAllHidden : function(){ //get number of all+hidden descendant leaves
		//if( this._countAllHidden !== false ) return this._countAllHidden;
		var hiddenCount = 0;
		var leafCount = 0;
		for (var i in this.children) {
			var child = this.children[i];
			if(child.children && child.children.length > 0)  {
				var countarr = child.getCountAllHidden();
				if(child.hidden){ hiddenCount += countarr[1]; leafCount += countarr[1]; }
				else { hiddenCount += countarr[0]; leafCount += countarr[1]; }
			} else {
				if(child.type != 'ancestral'){
					leafCount++; 
					if(child.hidden){ hiddenCount ++; }
				}
			}
		}
		this._countAllHidden = hiddenCount;
		this._countAllLeafs = leafCount;
		return [hiddenCount,leafCount];
	},
	
	getCountImmediateChildren : function(){ //get number of visible children
		//if( this._countImmediateChildren !== false ) return this._countImmediateChildren;
		var nodeCount = 0;

		for (var i in this.children) {
			if(!this.children[i].hidden){ nodeCount ++; }
		}
		this._countImmediateChildren = nodeCount;
		return nodeCount;
	},
	
	getVisibleParentBranch : function(){
		if(this.parent.getCountImmediateChildren() > 1){ return this; }
		else{ return this.parent.getVisibleParentBranch(); }
	},
	
	hideToggle : function(action){ //hide/show a node
		var ishidden = action ? action=='hide' ? false : true : this.hidden;
		if(!ishidden){
			this.parent._countImmediateChildren = false; //force recount
			if(this.parent.getCountImmediateChildren()<2){ //if only 1 visible child
				this.getVisibleParentBranch().hidden = true;
			}
			else { this.hidden = true; }
		}
		else { this.hidden = false; }
	},
	
	showSubtree : function(ancestral,hide){ //show all descendants or show/hide all ancestral leaves
		for (var i in this.children) {
			var child = this.children[i];
			if(child.children && child.children.length > 0){
				child.showSubtree(ancestral,hide);
			}
			else if((ancestral && child.type=='ancestral')||(!ancestral && child.type!='ancestral')){
				child.hidden = hide? true : false;
			}			
		}
		this.hidden = false;
	},
	
	getMidbranchPosition : function(firstBranch){
		//if( this._midBranchPosition !== false ) return this._midBranchPosition; //use cache
		this._midBranchPosition = firstBranch ? this.children[0].getCountAllChildren()-0.5 : this.children[0].getCountAllChildren()+0.5;
		if(this.children[0].getCountAllChildren()==0){ this._midBranchPosition += 1; }
		if(this.children[1].type=='ancestral'&& !this.children[1].hidden){ 
			this._midBranchPosition += 0.5; 
			if((this.children[0].hidden && !this.children[2].hidden)||this.getCountImmediateChildren()==1){ this._midBranchPosition -= 1; }
		} else if(this.getCountImmediateChildren()==1){ this._midBranchPosition -= 0.5; }
		return this._midBranchPosition;
	},
	
	highlight : function(){
		var node = this;
		node.active = true;
		if(node.type=='stem'){
			setTimeout(function(){ node.svgEl.attr({'fill':'orange','fill-opacity':1}) },100);
		}
		else setTimeout(function(){ node.svgEl.attr({'fill':'orange'}); },100);
		
	},
	
	unhighlight : function(){
		var node = this;
		node.active = false;
		if(node.type=='stem'){
			setTimeout(function(){ node.svgEl.attr({'fill':'red','fill-opacity':0}) },100);
		}
		else setTimeout(function(){ node.svgEl.attr({'fill':'black'}) },100);
	},
	
	removeAnc : function(){ //strip all ancestral seq. leaves
		var carr = this.children, anci;
		for (var i in carr){
			if(carr[i].children.length > 0) carr[i].removeAnc(); 
			else if(carr[i].type=='ancestral') anci = i;
		}
		if(anci) carr.splice(anci,1);
		return this;
	},
	
	restoreAnc : function(){ //reinsert leaves for ancestral seq.
		var node = this;
		for(var i in node.children) if(node.children[i].children.length > 0) node.children[i].restoreAnc();
		if(node.children.length > 1 && node.children[node.children.length-2].type != 'ancestral' && node.name && typeof(names[node.name]) != 'undefined'){
			var lastchild = node.children.pop();
			var ancnode = new Smits.PhyloCanvas.Node(node);
			ancnode.len = 0.0001; ancnode.lenFromRoot = node.lenFromRoot;
			ancnode.level = node.level + 1; ancnode.type = 'ancestral';
			ancnode.dataid = node.name;
			ancnode.name = names[node.name].length > 0 ? names[node.name] : 'Ancestor '+node.name;
			ancnode.hidden = true;
			node.children.push(ancnode,lastchild);
		}
	},
	
	nodeArray : function(){ //returns flattened array of nested nodetree
		var node = this.removeAnc();
		var nodearr = new Array();
		var stack = new Array();
		stack.push({node:node, i:0});
		for (;;) {
			while (stack[stack.length-1].i != stack[stack.length-1].node.children.length){
				var lastobj = stack[stack.length-1];
				stack.push({node:lastobj.node.children[lastobj.i], i:0});
			}
			nodearr.push(stack.pop().node);
			if (stack.length > 0) ++stack[stack.length-1].i;
			else break;
		}
		return nodearr;
	},
	
	getRoot : function(mark){
		var node = this;
		while(node.parent){ node = node.parent; if(mark) node.altered = true; }
		return node;
	},
	
	setRoot : function(new_root,root){
		var root = root || this.getRoot();
		for(var prop in new_root){ //swap old root with the new one
			if(typeof(new_root[prop])!='function') root[prop] = new_root[prop];
		}
		for(var child in new_root.children) new_root.children[child].parent = root;
		root.clearChildrenCache();
		root.id = 1;
		root.name = 'Root';
		root.len = 0.0001;
		root.parent = false;
		root.altered = true;
		if(model.treealtered()==false) model.treealtered(true);
		return root;
	},
	
	reRoot : function(dist){ //place node as tree outgroup
		var i, plen, nodelen, pnode, newnode, gpnode, ggpnode, new_root;
		var root = this.getRoot().removeAnc();
		var node = this;
		if (node == root) return root;
		if (isNaN(dist) || dist<0 || dist>node.len) dist = node.len/2.0;
		nodelen = node.len;
		node.getRoot('mark');
		
	  	//construct new root node
		newnode = new_root = new Smits.PhyloCanvas.Node();
		newnode.name = 'Root';
		newnode.len = root.len; 
		newnode.children[0] = node;
		newnode.children[0].len = dist;
		pnode = node.parent;
		newnode.children[0].parent = newnode;
		for (i = 0; i < pnode.children.length; ++i)
			if (pnode.children[i] == node) break;
		newnode.children[1] = pnode;
		plen = pnode.len;
		pnode.len = nodelen - dist;
		gpnode = pnode.parent;
		pnode.parent = newnode;
		while (gpnode){ //travel down to current root (gather subtrees)
			ggpnode = gpnode.parent;
			pnode.children[i] = gpnode;
			for (i = 0; i < gpnode.children.length; ++i) //i=current travelbranch
				if (gpnode.children[i] == pnode) break;
			gpnode.parent = pnode;
			nodelen = gpnode.len; gpnode.len = plen; plen = nodelen;
			newnode = pnode; pnode = gpnode; gpnode = ggpnode; //go up one level
		}
		if (pnode.children.length == 2){ //remove old root from its branch and link the other branch
			var otherchild = pnode.children[1 - i];
			for (i = 0; i < newnode.children.length; i++) // i=branch of current root
				if (newnode.children[i] == pnode) break;
			otherchild.len += pnode.len||0;
			otherchild.parent = newnode;
			newnode.children[i] = otherchild; //link the child from root-detached branch
		} else { //multifurcating node. Just remove old root.
			pnode.children.splice(i,1);
		}
		node.setRoot(new_root,root);
	},
	
	swap : function(){ //swap children
		var swapnode = this.children[0];
		this.children[0] = this.children[this.children.length-1];
		this.children[this.children.length-1] = swapnode;
	},
	
	//Move: prune the subtree descending from this node and regragh it to the edge between targetnode and its parent
	move : function move(target){
		var root = this.getRoot().removeAnc();
		var node = this;
		if (node === root || node.parent === root) return false; //can't move root
		for (var r = target; r.parent; r = r.parent)
			if (r === node) return false; //node is an ancestor of target. Can't move.
		node.remove();

		var placeholder = new Smits.PhyloCanvas.Node();
		placeholder.children.push(root); root.parent = placeholder;

		var i, pnode = target.parent;
		for (i in pnode.children) if (pnode.children[i] == target) break;
		var newnode = new Smits.PhyloCanvas.Node();
		newnode.parent = pnode; pnode.children[i] = newnode;
		pnode.altered = true;
		if (target.len > 0) {
			newnode.len = target.len/2;
			target.len /= 2;
		}
		newnode.children.push(node); node.parent = newnode;
		newnode.children.push(target); target.parent = newnode;
		node.setRoot(placeholder.children[0],root);
		node.getRoot('mark');
	},
	
	remove : function(){ //remove node+descendants from tree
		var root = this.getRoot().removeAnc();
		var node = this;
		if (node == root || node.parent == root) return;
		node.getRoot('mark'); //flag path to root

		var placeholder = new Smits.PhyloCanvas.Node();
		placeholder.children.push(root); root.parent = placeholder;

		var pnode = node.parent, i;
		if (pnode.children.length == 2) { //remove parent,
			var otherbranch, gpnode = pnode.parent;
			i = (pnode.children[0] == node)? 0 : 1;
			otherbranch = pnode.children[1 - i]; //take the other child
			otherbranch.len = Smits.Common.roundFloat(otherbranch.len+pnode.len);
			otherbranch.parent = gpnode; //and connect with grandparent
			for (i in gpnode.children) if(gpnode.children[i] == pnode) break;
			gpnode.children[i] = otherbranch; pnode.parent = false;
		} else { //multifurcating parent
			for (i in pnode.children) if (pnode.children[i] == node) break;
			pnode.children.splice(i,1);
		}

		node.setRoot(placeholder.children[0],root);
	},
	
	write : function(nhx){ //convert nodetree to newick string
		var nodearr = this.nodeArray();
		//update levels
		nodearr[nodearr.length-1].nwlevel = 0;
		for (var i = nodearr.length-2; i>=0 ;i--) {
			var node = nodearr[i];
			node.nwlevel = node.parent.nwlevel+1;
		}
		//generate newick
		var str = '';
		var curlevel = 0, isfirst = true;
		for(var i in nodearr) {
			var node = nodearr[i];
			var n_bra = node.nwlevel - curlevel;
			if (n_bra > 0) {
				if (isfirst) isfirst = false;
				else str += ", ";
				for (var j = 0; j < n_bra; ++j) str += "(";
			} else if (n_bra < 0) str += ")";
			else str += ", ";
			if(node.name) str += String(node.name);
			if(node.len >= 0 && node.nwlevel > 0) str += ":" + node.len;
			var nhx = true;
			if(nhx){ //add NHX tags
				node.meta = (node.confidence?':B='+node.confidence:'')+(node.hidden?':Co=Y':'')+(node.altered?':XN=realign':'');
				if(node.meta) node.meta = '[&&NHX'+node.meta+']';
				if(node.meta) str += node.meta;
			}
			curlevel = node.level;
		}
		str += ";\n";
		this.restoreAnc();
		return str;
	},
	
	calcxy : function(){ //calculate coords for tree preview canvas
		var i,j;
		var nodearr = this.nodeArray();
		var scale = this.getCountAllHidden()[1]-1; //nr. of all leafs
		for(i = j = 0; i < nodearr.length; i++){ //calculate y
			var node = nodearr[i];
			node.canvy = node.children.length>0? (node.children[0].canvy + node.children[node.children.length-1].canvy)/2 : (j++)/scale;
			if (node.children.length == 0) node.miny = node.maxy = node.canvy;
			else node.miny = node.children[0].miny, node.maxy = node.children[node.children.length-1].maxy;
		}
		// calculate x
		nodearr[nodearr.length-1].canvx = 0;
		scale = 0;
		for(i = nodearr.length-2; i >= 0; i--){
			var node = nodearr[i];
			node.canvx = node.parent.canvx + node.len;
			if(node.canvx > scale) scale = node.canvx;
		}
		for (i = 0; i < nodearr.length; i++) nodearr[i].canvx /= scale;
		return nodearr;
	},
	
	makeCanvas : function(){ //draw tree preview canvas
		var nodearr = this.calcxy();
		var conf = {width:100,height:150,xmargin:4,ymargin:2,fontsize:5,c_line:"rgb(60,60,60)"};
		if(nodearr.length<10) conf.width = conf.height = 8*nodearr.length;
		var canvas = document.createElement('canvas');
		canvas.width = conf.width; canvas.height = conf.height;
		var ctx = canvas.getContext("2d");
		ctx.strokeStyle = ctx.fillStyle = "white";
		ctx.fillRect(0, 0, conf.width, conf.height);
	
		var real_x = conf.width-2 * conf.xmargin;
		var real_y = conf.height-2 * conf.ymargin - conf.fontsize;
		var shift_x = conf.xmargin;
		var shift_y = conf.ymargin + conf.fontsize/2;
	
		// horizontal lines
		var y;
		ctx.strokeStyle = conf.c_line;
		ctx.beginPath();
		y = nodearr[nodearr.length-1].canvy * real_y + shift_y;
		ctx.moveTo(shift_x, y); ctx.lineTo(nodearr[nodearr.length-1].canvx * real_x + shift_x, y);
		for (var i = 0; i < nodearr.length - 1; i++) {
			var node = nodearr[i];
			y = node.canvy * real_y + shift_y;
			ctx.moveTo(node.parent.canvx * real_x + shift_x, y);
			ctx.lineTo(node.canvx * real_x + shift_x, y);
		}
		// vertical lines
		var x;
		for (var i = 0; i < nodearr.length; i++) {
			var node = nodearr[i];
			if (node.children.length == 0) continue;
			x = node.canvx * real_x + shift_x;
			ctx.moveTo(x, node.children[0].canvy * real_y + shift_y);
			ctx.lineTo(x, node.children[node.children.length-1].canvy * real_y + shift_y);
		}
		ctx.stroke();
		ctx.closePath();
		this.restoreAnc();
		return canvas;
	}	
};//Node prototype functions

Smits.PhyloCanvas.NewickParse = function(){
/// Parse (extended) Newick formatted text to a tree data object ///
	var text, ch, pos=0, mpos=0, mLevel=0, mLenFromRoot=0, validate,
		
	object = function (parentNode) {  //fill leaf nodes with data
		var node  = new Smits.PhyloCanvas.Node(parentNode);
		while (ch !== ')' && ch !== ',' && ch !== '' && pos<mpos) {
			if (ch === ':'){
				next();
				node.len = Smits.Common.roundFloat(string(), 4);  // round to 4 decimal places
				if(node.len == 0){
					node.len = 0.0001;
				}
			} else if (ch === "'" || ch === '"'){ 
				node.type = "label";
				node.name = quotedString(ch);
			} else if (ch === "["){
				var meta = node.meta = quotedString(ch);
				if(meta.indexOf(':Co=Y')!=-1) node.hidden = true;
				if(meta.indexOf(':B=')!=-1) node.confidence = meta.match(/:B=\w+/)[0];
			} else {
				node.type = "label"; 
				node.name = string();
			}
		}
		node.level = parentNode.level + 1;
		return node;
	},
	
	objectIterate = function(parentNode){ //make stem nodes
		while(ch !== '(' && ch !== '' && pos<mpos){ next(); }//search for first '('
		var node = new Smits.PhyloCanvas.Node(parentNode);
		if(parentNode){
			node.level = parentNode.level + 1;
		}
		while( ch !== ')' && ch !== '' && pos<mpos){ //build node tree
			next();
			if( ch === '(' ) {
				node.children.push(objectIterate(node)); //dig deeper 
			} else {
				node.children.push(object(node)); //add leaf
			}
		}
		next(); //one subtree made - ')' encountered, finish stem node (add data)
		if(ch !== ':' && ch !== ')' && ch !== ',' && ch !== ';'){
			if (ch === "'" || ch === '"'){
				node.type = "label";
				node.name = quotedString(ch);
			} else if (ch === "["){
				var meta = node.meta = quotedString(ch);
				if(meta.indexOf(':Co=Y')!=-1) node.hidden = true;
				if(meta.indexOf(':B=')!=-1) node.confidence = meta.match(/:B=\w+/)[0];
			}
			else{
				node.type = "label";
				node.name = string();
			}
		}
		if(ch === ':'){
			next();
			node.len = Smits.Common.roundFloat(string(), 4);
			if(node.len == 0){
				node.len = 0.0001;
			}
			node.type = "stem";
		}
		return node;		
	},
	
	string = function(){
		var string = '';
		while (ch !== ':' && ch !== ')' && ch !== ',' && ch !== ';' && ch !== '[' && ch !== '' && pos<mpos){
			string += ch;
			next();
		}
		return string;
	},

	quotedString = function(quoteType){
		var string = '';
		next();
		while (ch !== quoteType && pos<mpos){
			string += ch;
			next();
		}
		next();
		return string;
	},	
	
	next = function() {
		ch = text.charAt(pos);
		pos++;
		return ch;
	};

	return function(parseText){
		/* Privileged Methods */
		this.processLen = function(tree){ //process nodetree lengths & levels
			var node = tree || this.root;
			for(var i in node.children){
				var child = node.children[i];
				if(child.len === 0 || model.dendogram()) child.len = 1;
				child.lenFromRoot = Smits.Common.roundFloat(node.lenFromRoot + child.len, 4); //get node total length from root
				child.level = node.level+1;
				if(child.level > this.mLevel) this.mLevel = child.level; //get maxLevel
				if(child.lenFromRoot > this.mLenFromRoot) this.mLenFromRoot = child.lenFromRoot; //get maxLength
				if(child.children.length > 0) this.processLen(child);				
			}
			return node;
		};
		
		/* CONSTRUCTOR */
		text = parseText;
		pos = 0;
		mpos = text.length;
		this.mLevel = 0;
		this.mLenFromRoot = 0;
		next();
		this.root = objectIterate(); //read text to nodetree
		this.root.len = 0.0001;
		this.processLen(); //process nodetree
	}

}();

Smits.PhyloCanvas.NewickParse.prototype = {};

Smits.PhyloCanvas.PhyloxmlParse = function(){
/// Parse PhyloXML text format to a tree data object ///
	var mLevel = 0,
	mLenFromRoot = 0,
	root,
	validate,
		
	recursiveParse = function(clade, parentNode){
		var node = new Smits.PhyloCanvas.Node(parentNode);
		if(parentNode){
			node.level = parentNode.level + 1;
		}
		
		if(clade.clade && clade.clade.length){
			for(var i = 0; i < clade.clade.length; i++){
				var thisClade = clade.clade[i];
				node.children.push(recursiveParse(thisClade, node));
			}
		}
		if(clade.branch_length){	// Branches can be attributes or own element
			if(typeof clade.branch_length === 'object'){
				clade.branch_length = clade.branch_length[0].Text;
			}

			node.len = Smits.Common.roundFloat(clade.branch_length, 4);			// round to 4 decimal places
			if(node.len == 0){
				node.len = 0.0001;
			}			
		}
		if(clade.name){
			node.type = 'label';
			node.name = clade.name[0].Text;
			if(clade.name[0] && clade.name[0].style){
				node.style = clade.name[0].style;
			}
			if(clade.name[0] && clade.name[0].bgStyle){
				node.bgStyle = clade.name[0].bgStyle;
			}			
		} else if(clade.confidence){
			node.name = clade.confidence[0].Text;
		}

		/* Collect further info that might be used as a label */
		if (clade.sequence && clade.sequence[0] && clade.sequence[0].name && clade.sequence[0].name[0] && clade.sequence[0].name[0].Text){
			node.sequenceName = clade.sequence[0].name[0].Text;
		}
		if (clade.taxonomy && clade.taxonomy[0]){
			if(clade.taxonomy[0].scientific_name && clade.taxonomy[0].scientific_name[0] && clade.taxonomy[0].scientific_name[0].Text){
				node.taxonomyScientificName = clade.taxonomy[0].scientific_name[0].Text;
			}
			if (clade.taxonomy[0].common_name  && clade.taxonomy[0].common_name[0] && clade.taxonomy[0].common_name[0].Text){
				node.taxonomyCommonName = clade.taxonomy[0].common_name[0].Text;
			}
		}
		if (clade.sequence && clade.sequence[0] && clade.sequence[0].accession && clade.sequence[0].accession[0] && clade.sequence[0].accession[0].Text){
			node.sequenceAccession = clade.sequence[0].accession[0].Text;
		}
		if (clade.point ){
			node.LatLong = [clade.point[0].lat[0].Text, clade.point[0]['long'][0].Text];
		}		

		
		/* Prioritization of Label */
		if(!node.name){
			if(node.sequenceName){
				node.name = node.sequenceName;
			} else if (node.taxonomyScientificName){
				node.name = node.taxonomyScientificName;
			} else if (node.taxonomyCommonName){
				node.name = node.taxonomyCommonName;
			} else if (node.sequenceAccession){
				node.name = node.sequenceAccession;
			}
			if(node.name){	// if name is now set, type is 'label'
				node.type = 'label'; 
			}
		}
		
		if(clade.annotation){
			if(clade.annotation[0] && clade.annotation[0].desc && clade.annotation[0].desc[0] && clade.annotation[0].desc[0].Text){
				node.description = clade.annotation[0].desc[0].Text;
			}
			if(clade.annotation[0] && clade.annotation[0].uri && clade.annotation[0].uri[0] && clade.annotation[0].uri[0].Text){
				node.uri = clade.annotation[0].uri[0].Text;
			}			
			if(clade.annotation[0] && clade.annotation[0].img){
				for(var i in clade.annotation[0].img){
					if(Smits.Common.isInteger(i)){
						node.img[i] = clade.annotation[0].img[i].Text;
					}
				}
			}
		}
		if(clade.chart){
			if(clade.chart[0]){
				for(var i in clade.chart[0]){
					if(i != 'Text' && i != '_children'){
					node.chart[i] = clade.chart[0][i][0].Text;
					}
				}
			}
			
		}
		
		// Validation
		if(node && node.level > 1){
			if(!node.len){
				validate = 'Error. Please include Branch Lengths - we only draw rooted phylogenetic trees.';
			}
		}
			
		return node;
	},
	
	recursiveProcessLen = function(node, parentNode){
		if(node.children && node.children.length){
			for( var i = 0; i < node.children.length; i++){
				var child = node.children[i];
				child.lenFromRoot = Math.round( (child.len + node.lenFromRoot) *10000)/10000;
				if(child.level > mLevel) mLevel = child.level;
				if(child.lenFromRoot > mLenFromRoot) mLenFromRoot = child.lenFromRoot;
				if(child.children.length > 0){
					recursiveProcessLen(child, node); 
				}				
			}
		}
		return node;
	},
	
	recursiveProcessParameters = function(parametersEl, treeType){
		for (var i in parametersEl){
			if(i != '_children' && i != 'Text'){
				if(i == 'rectangular' || i == 'circular'){
					recursiveProcessParameters(parametersEl[i][0], i);
				} else {
					if(!Smits.PhyloCanvas.Render.Parameters[i]) {  Smits.PhyloCanvas.Render.Parameters[i] = {}; };
					Smits.PhyloCanvas.Render.Parameters.set(i, parametersEl[i][0].Text, treeType);
				}
			}
		}
		return;
	};

	return function(jsonString){
		/* Privileged Methods */
		this.getRoot = function(){
			return root;
		};
		this.getMaxLevel = function(){
			return mLevel;
		};
		this.getMaxLen = function(){
			return mLenFromRoot;
		};		
		this.getValidate = function(){
			return validate;
		};
		
		
		/* CONSTRUCTOR */	
		if(jsonString.phylogeny && jsonString.phylogeny[0] && jsonString.phylogeny[0].clade){
			root = recursiveParse(jsonString.phylogeny[0].clade[0]);
		}
		
		if(jsonString.phylogeny && jsonString.phylogeny[0] && jsonString.phylogeny[0].render && jsonString.phylogeny[0].render[0]){
			var render = jsonString.phylogeny[0].render[0];
			
			// Custom Styles
			if(render && render.styles){
				var styles = render.styles[0];
				for (var i in styles){
					if(i != '_children' && i != 'Text'){
						if(styles[i][0]['type'] && styles[i][0]['type'] == "radialGradient" && Raphael.svg){
							// radialGradient only supported by SVG
							styles[i][0]['name'] = i;
							Smits.PhyloCanvas.Render.Style[i] = styles[i][0];
							if(!Smits.PhyloCanvas.Render.Style['jsphylosvgGradientList']) { Smits.PhyloCanvas.Render.Style['jsphylosvgGradientList'] = [] };
							Smits.PhyloCanvas.Render.Style['jsphylosvgGradientList'].push(i); 
						} else {
							if(!Smits.PhyloCanvas.Render.Style[i]) {  Smits.PhyloCanvas.Render.Style[i] = {}; };
							for(var j in styles[i][0]){
								if(j != '_attributes' && j != '_children' && j != 'type'){
									Smits.PhyloCanvas.Render.Style[i][j.replace('_', '-')] = styles[i][0][j];		// This is quite painful, as xml does not allow dashes
								}
							}
						}
						
					}
				}
			}
			
			// Custom Parameters
			if(render && render.parameters){
				recursiveProcessParameters(render.parameters[0]);
			}			
			
			// Charts
			if(render && render.charts){
				var charts = render.charts[0];
				for (var i in charts){
					if(i != '_children' && i != 'Text'){
						for(var j in charts[i]){
							if(charts[i][j].type == "binary"){
								charts[i][j].chart = i;
								Smits.PhyloCanvas.Render.Parameters.binaryCharts.push(charts[i][j]);
							} else if (charts[i][j].type == "integratedBinary"){
								charts[i][j].chart = i;
								Smits.PhyloCanvas.Render.Parameters.integratedBinaryCharts.push(charts[i][j]);								
							} else if (charts[i][j].type == "bar"){
								charts[i][j].chart = i;
								Smits.PhyloCanvas.Render.Parameters.barCharts.push(charts[i][j]);
							}
						}
					}
				}
			}			
			
		}
		
		root = recursiveProcessLen(root);

	}

}();

Smits.PhyloCanvas.PhyloxmlParse.prototype = {};

Smits.PhyloCanvas.Render = {};
Smits.PhyloCanvas.Render.Style = {

	/* Default Styles */
	
	line: {
		//"stroke":	'rgb(0,0,0)',
		//"stroke-width":	1,
		//"stroke-linecap": 'round'
	},
	
	stemline: {
		//"stroke":	'rgb(0,0,0)',
		//"stroke-width":	1,
		//"stroke-linecap": 'round'
	},
	
	text: {
		"font-family":	'Verdana',
		"text-anchor":	'start'
	},
	
	path: {
		"stroke": 'rgb(0,0,0)',
		"stroke-width":	1	
	},
	
	connectedDash : {
		//"stroke": 'rgb(150,150,150)',
		//"stroke-width":	1,
		"stroke-dasharray":	"1,4",
		//"stroke-linecap": "round"
	},
	
	textSecantBg : {
		"fill": 	'#EEE',
		"stroke":	'#DDD'
	},
	
	highlightedEdgeCircle : {
		"stroke": 	'red',
		"fill" : 'none'
	},
	
	nodeCircle : {
		"fill": "red",
		"fill-opacity": 0,
		"stroke": "red",
		"stroke-opacity": 0,
		"z-index": "10"
	},
	
	barChart : {
		'fill':		'#003300',
		'stroke':		'#DDD'
	},
	
	getStyle : function(requestStyle, fallbackStyle){
		if(this[requestStyle]){
			return this[requestStyle];
		} else {
			return this[fallbackStyle];
		}
	
	}
};

Smits.PhyloCanvas.Render.Parameters = {
	/// Style & mouse event parameters for tree SVG elements ///

	/* DEFAULT PARAMETERS */
	jsOverride: 0,				// If set, js will override chart's file setting
	
	/** Phylogram parameters are separated because they behave very differently **/
	
	/* Rectangular Phylogram */
	Rectangular : {
		bufferX			: 50, 			// Reduces the available canvas space for tree branches, allowing
										// for more space for the textual/charting components
		paddingX		: 4,
		paddingY		: 15,
		bufferInnerLabels : 2, 		// Pixels
		bufferOuterLabels : 0, 			// Pixels
		minHeightBetweenLeaves : 3,  	// Should probably set pretty low, as clipping may occur if it needs to be implemented		
		
		alignPadding	: 0,			// Pixels to push the labels out by - this extension should be 
										// compensated by an increase in bufferX too
		alignRight		: true,
		
		showScaleBar	: false			// (STRING,  e.g. "0.05") Shows a scale bar at the bottom of the tree
	},
	
	/* Circular Phylogram */
	Circular : {
		bufferRadius 		: 0.33,		// Margins of Tree Circle
										// If > 1, it is in pixels
										// If < 1, it is a percentage of the full canvas size		
		bufferAngle 		: 20,		// controls split size in circle		
		initStartAngle 		: 160,		
		innerCircleRadius 	: 0,
		minHeightBetweenLeaves : 5,

		/* Labels */
		bufferInnerLabels : 2, 			// Pixels
		bufferOuterLabels : 5 			// Pixels
	},
	
	/* Charts */
	binaryCharts : [],
	integratedBinaryCharts : [],
	barCharts : [],

		/* Binary Defaults */
		binaryChartBufferInner : 5, 
		binaryChartBufferSiblings : 0.01,
		binaryChartThickness : 15,
		binaryChartDisjointed : false,
			
		/* Bar Defaults */
		barChartBufferInner : 3,
		barChartHeight : 50,
		barChartWidth : 0.5,	// If > 1, it is in pixels
								// If < 1, it is a percentage of the node width 
						
		/* 
			Rollover Events 
				At minimum, the params object has the following properties:
					.svg
					.node
					.x
					.y
					.textEl
		*/
		mouseRollOver : function(params) {
			if(params.node.edgeCircleHighlight){
				if(!params.node.active) params.node.edgeCircleHighlight.show();
			} else {
				var circleObject = params.svg.draw(
					new Smits.PhyloCanvas.Render.Circle(
						params.x, params.y, 5,
						{ attr: Smits.PhyloCanvas.Render.Style.highlightedEdgeCircle }
					)
				);
				params.node.edgeCircleHighlight = circleObject[0];
			}					
			if(params.textEl){ //hover on leaf label
			  if(!params.node.active) params.textEl.attr({ fill: 'red' });
			  var topy = $(params.textEl.node).offset().top-$('#seq').offset().top;
			  topy = Math.round(topy/model.boxh())*model.boxh(); //snap to rowgrid
			  rowborder({starty:topy},'keep');
			  params.node.rolltimer = setTimeout(function(){ //show full name on mouse hover
			  	var adj = is.safari||is.chrome? 1: 0;//webkit adjustment hack
				$("#namelabel").css({
					'font-size' : model.fontsize()+'px','color':'red',
					'top' : $(params.textEl.node).offset().top+adj,
					'left' : $("#right").position().left-14+'px'
				});
				$("#namelabel span").css('margin-left',0-$('#names').innerWidth()+4+'px');
				$("#namelabel span").text(params.node.name);
				if($(params.textEl.node).offset().top!=0){
					$("#namelabel").css('display','block');
					setTimeout(function(){ $("#namelabel").css('opacity',1) },50);
				}
				var curtime = new Date().getTime();
				if(!rollstart || curtime-rollstart>20000){//limit tooltip frequency
					tooltip(params.e,'Click or drag',{target:params.textEl.node,height:model.boxh()});
					rollstart = curtime;
				}
			  },800);
			}
		},
		mouseRollOut : function(params) {
			params.node.edgeCircleHighlight.hide();
			if(params.textEl){ //mouse out from leaf label
				clearTimeout(params.node.rolltimer);
				$("#namelabel").css('opacity',0);
				setTimeout(function(){$("#namelabel").hide()},500);
				if(!params.node.active) params.textEl.attr({ fill: '#000' });
			}
		},
		onClickAction : function(params) {
			params.node.edgeCircleHighlight.hide();		
			if(params.textEl){ //click on leaf label
				params.textEl.attr({ fill: 'red' });
				params.node.active = true;
				var menudata = {};
				menudata['<span class="svgicon" title="Hide leaf and its sequence">'+svgicon('hide')+'</span>Hide leaf'] = function(){ params.node.hideToggle(); refresh(); };
				menudata['<span class="svgicon" title="Graft this node to another branch in the tree">'+svgicon('move')+'</span>Move leaf'] = function(){ setTimeout(function(){ params.node.highlight() },50); movenode('',params.node,'tspan'); };
    			menudata['<span class="svgicon" title="Place this node as the tree outgroup">'+svgicon('root')+'</span>Place root here'] = function(){ params.node.reRoot(); refresh(); };
    			menudata['<span class="svgicon" title="Remove this node and its children from the tree">'+svgicon('trash')+'</span>Remove leaf'] = function(){ params.node.remove(); refresh(); };
    			hidetooltip();
    			setTimeout(function(){ tooltip('','',{arrow:'top',id:'namemenu',data:menudata,target:{ startx:$("#names").offset().left+20, starty:$(params.textEl.node).offset().top+2, treenode:params.node }}) },100);
    		}
	},

	set : function(param, value, treeType){
		if(!this.jsOverride){
			if(treeType){
				if(treeType == 'circular'){				
					this['Circular'][param] = parseFloat(value);
				} else if (treeType == 'rectangular'){
					this['Rectangular'][param] = parseFloat(value);
				}
			} else {
				this[param] = parseFloat(value);
			}
		}
	}
};

Smits.PhyloCanvas.Render.Line = function(){

	return function(x1, y1, x2, y2, params){
		/* Defaults */	
		this.type = 'line';
		this.attr = Smits.PhyloCanvas.Render.Style.line;
		
		this.x1 = x1;
		this.x2 = x2;
		this.y1 = y1;
		this.y2 = y2;

		if(params) {
			Smits.Common.apply(this, params);
			if(params.attr) this.attr = params.attr;
		}

	}
}();
Smits.PhyloCanvas.Render.Text = function(){

	return function(x, y, text, params){
		/* Defaults */
		this.type = 'text';
		this.attr = Smits.PhyloCanvas.Render.Style.text;
		
		this.x = x;
		this.y = y;
		this.text = text;
		
		if(params) {
			Smits.Common.apply(this, params);
			if(params.attr) this.attr = params.attr;
		}
	}
}();
Smits.PhyloCanvas.Render.Path = function(){
	var attr = Smits.PhyloCanvas.Render.Style.path;
	
	return function(path, params){
		/* Defaults */
		this.type = 'path';
		this.attr = Smits.PhyloCanvas.Render.Style.path;
		
		this.path = path;
		if(params) {
			Smits.Common.apply(this, params);
			if(params.attr) this.attr = params.attr;
		}

	}
}();
Smits.PhyloCanvas.Render.Circle = function(){

	return function(x, y, radius, params){
		/* Defaults */	
		this.type = 'circle';
	
		this.x = x;
		this.y = y;
		this.radius = radius;
		
		if(params) {
			Smits.Common.apply(this, params);
			if(params.attr) this.attr = params.attr;
		}
		
	}
}();

Smits.PhyloCanvas.Render.SVG = function(){
	var namesWidth,
		canvasSize;
		
	return function(snamesWidth, canvasWidth, canvasHeight){
	
		/* CONSTRUCTOR */
		namesWidth = snamesWidth;
		this.canvasSize = [canvasWidth, canvasHeight];
		
		this.svg1 = Raphael('tree', "100%", "100%");
		this.svg2 = Raphael('names', "100%", "100%");
		$(this.svg2.canvas).css('font-size',model.fontsize()+'px');
		//this.svg1.setViewBox(0, 0, this.canvasSize[0]-namesWidth, this.canvasSize[1], false);
		this.percX = function(num){ return num/(this.canvasSize[0]-namesWidth)*100+'%'; };
		this.percY = function(num){ return num/this.canvasSize[1]*100+'%'; };
	}
	
}();

Smits.PhyloCanvas.Render.SVG.prototype = {
	//Funcitons for svg object (includes multiple svgs)
	render : function(){
		var instructs = this.phylogramObject.getDrawInstructs();
		for (var i = 0; i < instructs.length; i++) {
		   if(instructs[i].type == 'line'){
				//var line = this.svg1.path(["M", instructs[i].x1, instructs[i].y1, "L", instructs[i].x2, instructs[i].y2]).attr(Smits.PhyloCanvas.Render.Style.line);
				obj = this.svg1.line(this.percX(instructs[i].x1), this.percY(instructs[i].y1), this.percX(instructs[i].x2), this.percY(instructs[i].y2)).attr(Smits.PhyloCanvas.Render.Style.line);
			} else if(instructs[i].type == 'path'){
				var path = this.svg1.path(instructs[i].path).attr(instructs[i].attr);			
			} else if(instructs[i].type == 'circle'){
				var path = this.svg1.circle(instructs[i].x, instructs[i].y, instructs[i].radius).attr({
					"stroke": 'red'
				});
			} else {
				var text = this.svg1.text(instructs[i].x, this.percY(instructs[i].y), instructs[i].text).attr(Smits.PhyloCanvas.Render.Style.text);
				if(instructs[i].attr){
					text.attr(instructs[i].attr);
				}
				if(instructs[i].rotate){
					text.rotate(instructs[i].rotate);
				}
				
				var bbox = text.getBBox();
				var hyp = Math.sqrt( (bbox.height * bbox.height) + (bbox.width * bbox.width) );	// get hypotenuse	
			} 
		}
	},
	
	draw : function(instruct){
		var obj, 
			param;

	   if(instruct.type == 'line'){
			//obj = this.svg1.path(["M", instruct.x1, instruct.y1, "L", instruct.x2, instruct.y2]).attr(Smits.PhyloCanvas.Render.Style.line);
			obj = this.svg1.line(this.percX(instruct.x1), this.percY(instruct.y1), this.percX(instruct.x2), this.percY(instruct.y2)).attr(instruct.attr);
		} else if(instruct.type == 'path'){
			obj = this.svg1.path(instruct.path).attr(instruct.attr);			
		} else if(instruct.type == 'circle'){
			obj = this.svg1.circle(this.percX(instruct.x), this.percY(instruct.y), instruct.radius).attr(instruct.attr);
		} else if(instruct.type == 'text'){
			if(instruct.attr.svg == 'svg1'){ obj = this.svg1.text(instruct.x, this.percY(instruct.y), instruct.text).attr(Smits.PhyloCanvas.Render.Style.text); }
			else { obj = this.svg2.text(instruct.x, this.percY(instruct.y), instruct.text).attr(Smits.PhyloCanvas.Render.Style.text); }
			if(instruct.attr){
				obj.attr(instruct.attr);
			}
			if(instruct.rotate){
				obj.rotate(instruct.rotate);
			}
			
			var bbox = obj.getBBox();
			param = Math.sqrt( (bbox.height * bbox.height) + (bbox.width * bbox.width) );	// get hypotenuse
		} 

		return [obj, param];
	}

};

Smits.PhyloCanvas.Render.Phylogram = function(){
	/// Draw a new tree, gets a tree data object + svg canvas as input ///
	var svg, data,
	sParams = Smits.PhyloCanvas.Render.Parameters.Rectangular,
	canvasX, canvasY,
	scaleX, scaleY, maxBranch,
	minHeightBetweenLeaves,
	firstBranch = true,
	absoluteY = 0, maxLabelLength = 0,
	outerX, outerY, outerRadius,
	x1, x2, y1, y2, 
	positionX, positionY,
	bufferX, paddingX, paddingY, labelsHold = [],
	namecounter = 0;
	
	var textPadding = function (y){
		return y + Math.round(y / 4);
	};
	
	var rectLinePathArray = function (x1, y1, x2, y2){
		return ["M", x1, y1, "L", x2, y1, "L", x2, y2, "L", x1, y2, "Z"];
	};
	
	var calculateNodePositions = function (node, positionX){
		if(node.len && firstBranch == false && node.getCountImmediateChildren() == 0 && !node.hidden){ 
			absoluteY = Smits.Common.roundFloat(absoluteY + scaleY, 4);
		}
		if(node.children.length > 0){ //draw stems
			var nodeCoords = [], x1,x2,y1,y2;
			node.restoreAnc();
			
			if(node.hidden){ return []; }
			
			//horizontal line
			if(node.len){
				x1 = positionX;
				x2 = positionX = Smits.Common.roundFloat(positionX + (scaleX * node.len), 4);
				y1 = absoluteY + (node.getMidbranchPosition(firstBranch) * scaleY);
				y2 = y1;
				var lineattr = Smits.PhyloCanvas.Render.Style.getStyle('stemline', 'line'); //set style, fallback style
				lineattr.svg = 'svg1'; lineattr.class = 'horizontal';
				if(node.uri) { lineattr.href = node.uri };
				var circleattr = Smits.PhyloCanvas.Render.Style.nodeCircle;
				if(node.level == 0){ 
					var innerY2 = absoluteY + (node.getMidbranchPosition(firstBranch) * scaleY);
				} else {
					var innerY2 = y2;
				}
				var stem = svg.draw(new Smits.PhyloCanvas.Render.Line(x1, y1, x2, y2, { attr: lineattr }));
				stem[0].data("node",node); //add data to svg element
				stem[0].attr("title","Branch length: "+node.len);
			
			//vertical line
			if(node.getCountImmediateChildren()>0){
				for(var i = 0; i < node.children.length; i++){
					var child = node.children[i];
					if(child.hidden){ continue; }
					nodeCoords.push(calculateNodePositions(child, positionX));
				}
				nodeCoords.push([y1,y1]);
			  	if(node.getCountAllChildren()>1){
			  		var flatNodeCoords = []; //establish vertical bounds
			  		for ( var i = 0; i < nodeCoords.length; i++ ){
					if(nodeCoords[i][0]) flatNodeCoords.push(nodeCoords[i][0]);
					if(nodeCoords[i][1]) flatNodeCoords.push(nodeCoords[i][1]);
			  	}
			  	var verticalY1 = Math.min.apply(null, flatNodeCoords );
			  	var verticalY2 = Math.max.apply(null, flatNodeCoords);
			
			  	svg.draw(new Smits.PhyloCanvas.Render.Line(positionX, verticalY1, positionX, verticalY2, { attr : Smits.PhyloCanvas.Render.Style.line }));
			 }
			}
			
			//draw injunction spot (check for hidden children)
			var tipnote = 'Click or drag';
			if(node.children[0].hidden || node.children[node.children.length-1].hidden){
				var cradius = 4;
				var first = node.children[0].hidden ? true : false;
				var last = node.children[node.children.length-1].hidden ? true : false;
				var hastree = (first&&node.children[0].type!='label')||(last&&node.children[node.children.length-1].type!='label')? 'red' : '';
				if(first && last){
					var spotattr =  {'fill':'white','stroke':'orange'}
					tipnote = 'Only node seq. shown';
				}else {
					var spotattr =  {'fill':'white','stroke':hastree||'black'}
					tipnote = hastree? 'Subtree hidden' : 'One leave hidden';
				}
			}else{ var cradius = 2; var spotattr =  {'fill':'black','stroke':'black'}; }
			if(node.altered){
				var spotattr =  {'fill':'red','stroke':'black'};
				tipnote = 'Needs realignment';
			}
			svg.draw(new Smits.PhyloCanvas.Render.Circle((x2 || positionX), innerY2, cradius, { attr: spotattr }));
			
			//draw hover circle
			var circle = svg.draw(new Smits.PhyloCanvas.Render.Circle((x2 || positionX), innerY2, 5, { attr: circleattr }));
			node.edgeCircleHighlight = node.svgEl = circle[0];
			circle[0].mouseover(function(e){
				if(!$('#treemenu .tooltipcontent').text()){ 
					circle[0].toFront(); 
					circle[0].attr({'fill-opacity':'1'});
					tooltip(e, 'Node '+node.name+($('#right').hasClass('dragmode')?'':'. <span style="color:rgb(190,190,190)">'+tipnote+'</span>'), {target:node,tooltip:"#treemenu",arrow:'left'});
				}
			});
			circle[0].mouseout(function(){ 
				if(!$('#treemenu .tooltipcontent').text()){ circle[0].attr({'fill-opacity':'0'}); hidetooltip("#treemenu"); 
			}});
			circle[0].click(function(e){
				if(!$('#treemenu .tooltipcontent').text()){
					tooltip(e,'Node '+node.name,{target:node,data:data,svg:svg,tooltip:$("#treemenu")});
					e.stopPropagation(); hidetooltip("#treemenu",'exclude');
					$('html').one('click',function(){ circle[0].attr({'fill-opacity':'0'}); hidetooltip("#treemenu"); });
				}
			});
			circle[0].data("node",node);
		  }	
		} else {//leafs
			if(node.name){ leafs[node.name] = node; }
			if(node.hidden){ return []; }
			
			x1 = positionX;
			x2 = Smits.Common.roundFloat(positionX + (scaleX * node.len), 2);
			y1 = absoluteY;
			y2 = absoluteY;
				
			// preserve for later processing
			node.y = absoluteY;
			labelsHold.push(node);				
				
			//horizontal endline
			var leafline = svg.draw(new Smits.PhyloCanvas.Render.Line(x1, y1, x2, y2));
			leafline[0].data("node",node); leafline[0].attr("class","horizontal");
			leafline[0].attr("title","Branch length: "+node.len);
			if(sParams.alignRight){ //dotline
				var dotline = svg.draw(new Smits.PhyloCanvas.Render.Line( x2, y2, sParams.alignPadding + maxBranch, y2, { attr : Smits.PhyloCanvas.Render.Style.connectedDash }));
				dotline[0].data("node",node); dotline[0].attr("class","horizontal");		
			}
			
			if(node.name){
				var attr = {};
				if(node.style){
					attr = Smits.PhyloCanvas.Render.Style.getStyle(node.style, 'text');
				}
				attr["text-anchor"] = 'start';
				if(node.uri) { attr.href = node.uri };
				if(node.description) { attr.title = node.description };
				if(typeof(node.dataid)=='undefined') { node.dataid = node.name; }
				visiblerows.push(node.dataid);
				if(names[node.name]){ node.name = names[node.name]; }
				node.count = namecounter;
				var leaflabel = svg.draw(
					new Smits.PhyloCanvas.Render.Text(
						sParams.bufferInnerLabels, 
						y2+3,
						node.name,
						{
							attr: attr
						}
					)
				);
				leaflabel[0].data("node",node);
				node.svgEl = leaflabel[0];				
				maxLabelLength = Math.max(leaflabel[1], maxLabelLength);
				
				// Rollover, Rollout and Click Events for label element
				if(Smits.PhyloCanvas.Render.Parameters.mouseRollOver){
					Smits.Common.addRaphEventHandler(
						leaflabel[0], 
						'mouseover', 
						Smits.PhyloCanvas.Render.Parameters.mouseRollOver, 
						{ svg: svg, node: node, x: x2, y: y2, textEl: leaflabel[0] }
					);
				}
				if(Smits.PhyloCanvas.Render.Parameters.mouseRollOut){
					Smits.Common.addRaphEventHandler(
						leaflabel[0], 
						'mouseout', 
						Smits.PhyloCanvas.Render.Parameters.mouseRollOut, 
						{ svg: svg, node: node, x: x2, y: y2, textEl: leaflabel[0] }
					);				
				}
				if(Smits.PhyloCanvas.Render.Parameters.onClickAction){
					Smits.Common.addRaphEventHandler(
						leaflabel[0], 
						'click', 
						Smits.PhyloCanvas.Render.Parameters.onClickAction, 
						{ svg: svg, node: node, x: x2, y: y2, textEl: leaflabel[0], data: data }
					);				
				}
			}
			
			if(firstBranch){
				firstBranch = false;
			}
			namecounter ++;
		
		}
		if(node.hidden){ return []; }
		return [y1, y2];
	};
	
	var drawScaleBar = function (){
		y = absoluteY + scaleY;
		x1 = 0;
		x2 = sParams.showScaleBar * scaleX;
		svg.draw(new Smits.PhyloCanvas.Render.Line(x1, y, x2, y));
		svg.draw(new Smits.PhyloCanvas.Render.Text(
			(x1+x2)/2, 
			y-8, 
			sParams.showScaleBar)
		);
	};
	
	var renderBinaryChart = function(x, groupName, params){
		var bufferInner = (params && params.bufferInner ? params.bufferInner : 0) | Smits.PhyloCanvas.Render.Parameters.binaryChartBufferInner,
			bufferSiblings = (params && params.bufferSiblings ? params.bufferSiblings * scaleY : 0) | (Smits.PhyloCanvas.Render.Parameters.binaryChartBufferSiblings < 1 ? scaleY * Smits.PhyloCanvas.Render.Parameters.binaryChartBufferSiblings : Smits.PhyloCanvas.Render.Parameters.binaryChartBufferSiblings),		
			thickness = (params && params.thickness ? params.thickness : 0) | Smits.PhyloCanvas.Render.Parameters.binaryChartThickness,
			beginY;
			
		for(var i = 0; i < labelsHold.length; i++){
			var node = labelsHold[i];
			svg.draw(
				new Smits.PhyloCanvas.Render.Path(
					rectLinePathArray(
						x + bufferInner,
						node.y - (scaleY/2) + (bufferSiblings/2),
						x + bufferInner + thickness, 
						node.y + (scaleY/2) - (bufferSiblings/2)
					),
					{ attr: Smits.PhyloCanvas.Render.Style.getStyle(node.chart[groupName], 'textSecantBg') }
				)
			);			
		}
		return x + bufferInner + thickness;
	};
	
	var renderBarChart = function(x, groupName, params){
		var allValues = [], maxValue,
			bufferInner = params && params.bufferInner ? params.bufferInner : 0 | Smits.PhyloCanvas.Render.Parameters.barChartBufferInner,
			height = params && params.height ? params.height : 0 | Smits.PhyloCanvas.Render.Parameters.barChartHeight,
			width = params && params.width ? (params.width < 1 ? scaleY * params.width : params.width ) : 0 | (Smits.PhyloCanvas.Render.Parameters.barChartWidth < 1 ? scaleY * Smits.PhyloCanvas.Render.Parameters.barChartWidth : Smits.PhyloCanvas.Render.Parameters.barChartWidth),
			scaleHeight = 0;
		
		// Need to get max value
		for(var i = 0; i < labelsHold.length; i++){
			allValues.push(labelsHold[i].chart[groupName]);
		}
		maxValue = Math.max.apply(null, allValues);
		scaleHeight = Smits.Common.roundFloat(height / maxValue, 4);
		
		for(var i = 0; i < labelsHold.length; i++){
			var node = labelsHold[i];
			svg.draw(
					new Smits.PhyloCanvas.Render.Path(
						rectLinePathArray(
							x + bufferInner,
							node.y - (width/2),
							x + bufferInner + (scaleHeight * node.chart[groupName]), 
							node.y + (width/2)
						),					
						{ attr: Smits.PhyloCanvas.Render.Style.getStyle(node.chart[groupName], 'barChart') }
					)
				);					
		}
		
		return x + bufferInner + height;
	};
	
	return function(inputSvg, inputData){
		/* Privileged Methods */
		this.getCanvasSize = function(){
			return [canvasX, canvasY];
		};		
		
		svg = inputSvg;
		data = inputData;
		
		/* CONSTRUCTOR */
		var node = data.root;
		node.clearChildrenCache();
		node.getCountAllHidden();
		seqcount = node.getCountAllChildren(); //count all visible leafs. used in height estimation.
		visiblerows.removeAll(); //reset list of visible sequences
		
		canvasX = $("#treewrap").width();			// Treecanvas Width
		canvasY = seqcount*model.boxh();		// Treecanvas Height
		svg.canvasSize = [canvasX,canvasY];
		
		bufferX = sParams.bufferX;
		paddingX = sParams.paddingX;
		paddingY = sParams.paddingY;
		minHeightBetweenLeaves = sParams.minHeightBetweenLeaves;

		absoluteY = paddingY;
		firstBranch = true;
		
		scaleX = Math.round((canvasX - bufferX - paddingX*2) / data.mLenFromRoot);
		//scaleY = Math.round((canvasY - paddingY*2) / (sParams.showScaleBar ? node.getCountAllChildren() : node.getCountAllChildren() - 1));
		scaleY = model.boxh(); //height of row
		if(scaleY < minHeightBetweenLeaves){
			scaleY = minHeightBetweenLeaves;
		}
		maxBranch = Math.round( canvasX - bufferX - paddingX*2 );	
		
		if(Smits.PhyloCanvas.Render.Parameters.binaryCharts.length || Smits.PhyloCanvas.Render.Parameters.barCharts.length){
			sParams.alignRight = true;
		}
		
		calculateNodePositions(node, paddingX);
		
		// Draw Scale Bar
		if(sParams.showScaleBar){
			drawScaleBar();
		}
		
		outerX = maxBranch + maxLabelLength + sParams.bufferInnerLabels;
		// Draw secant highlights
		if(Smits.PhyloCanvas.Render.Parameters.binaryCharts.length){
			var binaryCharts = Smits.PhyloCanvas.Render.Parameters.binaryCharts;
			for(var i in binaryCharts){
				outerX = renderBinaryChart(outerX, binaryCharts[i].chart, binaryCharts[i]);
			}
		}		
		
		// Draw Bar Chart
		if(Smits.PhyloCanvas.Render.Parameters.barCharts.length){
			var barCharts = Smits.PhyloCanvas.Render.Parameters.barCharts;
			for(var i in barCharts){
				outerRadius = renderBarChart(outerX, barCharts[i].chart, barCharts[i]);
			}
		}				

	}
}();
