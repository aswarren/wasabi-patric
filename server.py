#! /usr/bin/env python
#coding: utf-8
#Back-end server to support Wasabi web application
#Andres Veidenberg 2012 (andres.veidenberg@helsinki.fi)

import os,string,random,cgi,urllib2,subprocess,time,json,socket,shutil
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from SocketServer import ThreadingMixIn

apath = os.path.abspath
jobs = {}
urlcache = {}

def sendOK(self):
    self.send_response(200)
    self.send_header("Content-Type", "text/plain")
    self.end_headers()
    
class LocalServer(BaseHTTPRequestHandler): #class to handle local server/browser communication
    def log_message(self, format, *args):
        return #supress console connection log
        
    def do_HEAD(self):
        try:
            self.send_response(200)
            self.end_headers()
            self.wfile.write('URL exists')
            return
            
        except IOError:
            self.send_error(404,'File Not Found: %s' % self.path)
            
    def do_GET(self):
        try:
            url = self.path
            if url.endswith("/"):
                url += "index.html"
            url = url[1:] #remove leading /
            if('?' in url):
                urlarr = url.split('?')
                url = urlarr[0]
                params = urlarr[1]
            else: params = ''
            
            if('download' in params): ctype = 'application/octet-stream' #for download button
            elif('text' in params): ctype = 'text/plain'
            elif url.endswith(".html") | url.endswith(".css") | url.endswith(".js"): #send text for html page
                ctype = 'text/css' if url.endswith(".css") else 'text/javascript' if url.endswith(".js") else 'text/html'
            else: #send file for html page
                ctype = 'image' if url.endswith(".jpg")|url.endswith(".png")|url.endswith(".gif") else 'application/octet-stream'
            f = open(apath(url)) if 'text' in ctype else open(apath(url),'rb') #NOTE: query url is unsanitized
            filecontent = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", len(filecontent))
            self.end_headers()
            self.wfile.write(filecontent)
            f.close()
            return
            
        except IOError as e:
            self.send_error(404,'File Not Found: %s (%d: %s)' % (url,e.errno,e.strerror))

    def do_POST(self): #ajax request or file sent to server
        try:
            form = cgi.FieldStorage(fp = self.rfile, headers = self.headers, environ={'REQUEST_METHOD':'POST'})
            action = form.getvalue('action')
            if action == 'echofile':  #echo uploaded file back
                sendOK(self)
                self.wfile.write(form.getvalue('upfile'))
            elif action == 'geturl':  #download & send remote files
                self.send_response(200)
                self.send_header("Content-Type", "text/plain")
                url = form.getvalue('fileurl')
                urlfile = '' 
                if url in urlcache:
                    urlfile = urlcache[url]
                    del urlcache[url]
                else:
                    try:
                        urlfile = urllib2.urlopen(url).read()
                        urlcache[url] = urlfile #cache file for one retry (Firefox bug)
                    except urllib2.HTTPError as e:
                        self.end_headers()
                        self.wfile.write(e.read())
                if urlfile:
                    self.send_header("Content-Length", len(urlfile))
                    self.end_headers()
                    self.wfile.write(urlfile)
            elif (action == 'startalign') or (action == 'save'): #start new alignment job and/or save files to libary
                jobid = ''.join(random.choice(string.letters + string.digits) for i in range(10))
                parentid = form.getvalue('parentid','')
                currentid = form.getvalue('id','')
                writemode = form.getvalue('writemode','') #infer target path in library
                if (writemode=='sibling' and parentid): jobid = parentid+'/children/'+jobid
                elif (writemode=='child' and currentid): jobid = currentid+'/children/'+jobid
                elif (writemode=='overwrite' and currentid): jobid = currentid 
                odir = 'analyses/'+jobid+'/'
                if not os.path.exists(odir): os.makedirs(odir)
                name = form.getvalue('name','')
                metapath = apath(odir+'meta.txt') #metainfo for library
                importmetapath = apath(odir+'importmeta.txt') #metainfo for results import
                importdata = json.load(open(importmetapath)) if os.path.isfile(importmetapath) else {"id":jobid}
                idnames = form.getvalue('idnames','')
                if(idnames): importdata["idnames"] = json.loads(idnames)
                ensinfo = form.getvalue('ensinfo','')
                if(ensinfo): importdata["ensinfo"] = json.loads(ensinfo)
                nodeinfo = form.getvalue('nodeinfo','')
                if(nodeinfo): importdata["nodeinfo"] = json.loads(nodeinfo)
                visiblecols = form.getvalue('visiblecols','')
                if(visiblecols): importdata["visiblecols"] = json.loads(visiblecols)
                starttime = str(time.time())
                if action == 'startalign':
                    alignerpath = apath('aligners/prank/prank') #use supplied aligner binary, global install as a fallback
                    if not os.path.isfile(alignerpath): alignerpath = 'prank'
                    aligner = 'PRANK:'+alignerpath
                    jobtype = 'Prank alignment';
                    params = [alignerpath,'-d='+apath(odir+'input.fas'),'-o='+apath(odir+'out'),'-prunetree']
                    inpath = apath(odir+'input.fas')
                    fafile = open(inpath, 'w')
                    fafile.write(form.getvalue('fasta',''))
                    if 'newick' in form:
                        treefile = open(apath(odir+'input.tree'), 'w')
                        treefile.write(form.getvalue('newick',''))
                        params.append('-t='+apath(odir+'input.tree'))
                    params.append('-showxml')
                    if 'F' in form: params.append('+F')
                    if 'e' in form: params.append('-e')
                    if 'dots' in form: params.append('-dots')
                    if 'realign' in form: params.append('-update')
                    if 'anchor' not in form: params.append('-noanchors')
                    logpath = odir+'out.log'
                    logfile = open(apath(logpath), 'w')
                    detach_flag = 0x00000008 if os.name is 'nt' else 0 #for windows
                    popen = subprocess.Popen(params, stdout=logfile, stderr=logfile, creationflags=detach_flag, close_fds=True)
                    status = popen.poll()
                    status = str(status) if status else 'running' #0=finished, None=running
                    logline = ' '
                    jobs[jobid] = {'popen':popen,'starttime':starttime,'name':name,'aligner':aligner,'parameters':','.join(params[1:]),'logpath':logpath,'metapath':metapath,'order':str(len(jobs)),'type':jobtype}
                    jobdata = {"id":jobid,"name":name,"aligner":aligner,"parameters":",".join(params[1:]),"infile":inpath,"logfile":logpath,"starttime":starttime}
                    jobdata["status"] = status
                    jobdata["lasttime"] = starttime
                elif action == 'save': #write files to library path
                    savepath = apath(odir+'saved.xml')
                    savefile = open(savepath, 'w')
                    savefile.write(form.getvalue('file',''))
                    if(name): #save files as new library item
                        source = form.getvalue('source','')
                        jobdata = {"id":jobid, "name":name, "source":source, "starttime":starttime}
                    elif os.path.isfile(metapath): #overwrite existing item
                        jobdata = json.load(open(metapath))
                    else:
                        self.send_error(501,'Failed to save data')
                        return
                    jobdata["savetime"] = starttime
                    jobdata["outfile"] = odir+"saved.xml"
                metafile = open(metapath, 'w') #write metadata to files
                json.dump(jobdata,metafile)
                importmetafile = open(importmetapath, 'w')
                json.dump(importdata,importmetafile)
                sendOK(self)
                self.wfile.write('{"id":"'+jobid+'"}')
            elif action == 'alignstatus': #send status or terminate registered job(s)
                getid = form.getvalue('id','')
                sendstr = ''
                for jobid in jobs.keys():
                    job = jobs[jobid]
                    if getid and jobid is not getid: continue #get a specific job
                    imported = job.get('imported','')
                    order = job['order']
                    popen = job['popen']
                    status = popen.poll()
                    status = 'running' if status is None else str(status)
                    name = job['name']
                    params = job['parameters']
                    starttime = job['starttime']
                    outpath = ''
                    logpath = job['logpath']
                    if not os.path.isfile(logpath): continue
                    logstat = os.stat(logpath)
                    filetime = str(logstat.st_mtime)
                    endtime = ''
                    lastline = ''
                    if 'endtime' not in job: #job endtime not registered
                        logfile = open(logpath)
                        for logline in logfile: #get last logline
                            logline = logline.strip()
                            if len(logline)==0: continue
                            elif "\b" in logline: #remove backspace
                                logline = logline.translate(string.maketrans("\b", "|"))
                                splitted = logline.split("|")
                                lastline = splitted[len(splitted)-1]
                            else: lastline = logline
                        if status is not 'running': #job finished, mark endtime
                            odir = 'analyses/'+jobid+'/'
                            if os.path.isfile(odir+'out.2.xml'): outpath = odir+'out.2.xml'
                            elif os.path.isfile(odir+'out.1.xml'): outpath = odir+'out.1.xml'
                            elif os.path.isfile(odir+'out.0.xml'): outpath = odir+'out.0.xml'
                            else: outpath = ''
                            job['endtime'] = filetime
                            job['savetime'] = filetime
                            job['outfile'] = outpath
                            metapath = apath(odir+'meta.txt')
                            jobdata = json.load(open(metapath))
                            jobdata['endtime'] = filetime
                            jobdata['savetime'] = filetime
                            jobdata['endstatus'] = status
                            jobdata['outfile'] = outpath
                            json.dump(jobdata,open(metapath,'w'))
                    else: endtime = job['endtime']
                    if 'outfile' in job: outpath = job['outfile']
                    sendstr += '{"id":"'+jobid+'","name":"'+name+'","status":"'+status+'","parameters":"'+params+'","starttime":"'+starttime+'","endtime":"'+endtime+'","savetime":"'+endtime+'","lasttime":"'+filetime+'","log":"'+lastline+'","outfile":"'+outpath+'","logfile":"'+logpath+'","order":"'+order+'","imported":"'+imported+'"},'
                    if 'imported' in job: del jobs[jobid] #remove imported job from list
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'writemeta': #add data to job metadata file
                jobid = form.getvalue('id','')
                key = form.getvalue('key','imported')
                value = form.getvalue('value',str(time.time()))
                metapath = apath('analyses/'+jobid+'/meta.txt')
                if not jobid or not key or not os.path.isfile(metapath):
                    sendOK(self)
                    return
                if jobid in jobs: jobs[jobid][key] = value
                jobdata = json.load(open(metapath))
                jobdata[key] = value
                json.dump(jobdata,open(metapath,'w'))
                sendOK(self)
                self.wfile.write('['+json.dumps(jobdata)+']')
            elif action == 'getmeta': #get data for all imported jobs in output folder
                sendstr = ''
                parentid = form.getvalue('parentid','')
                parentdir = 'analyses/'+parentid+'/children/' if parentid else 'analyses/'
                for dirname in os.listdir(parentdir):
                    metapath = apath(parentdir+dirname+'/meta.txt')
                    if not os.path.isfile(metapath): continue
                    jobid = parentid+'/children/'+dirname if parentid else dirname
                    #if jobid in jobs and 'outfile' not in jobs[jobid]: continue #a running job
                    sendstr += open(metapath).read()+','
                    if os.path.exists(parentdir+dirname+'/children/'):
                        childcount = 0
                        for subdirname in os.listdir(parentdir+dirname+'/children/'):
                            if os.path.isfile(parentdir+dirname+'/children/'+subdirname+'/meta.txt'):
                                childid = parentid+'/children/'+dirname+'/children/'+subdirname
                                if childid in jobs and 'outfile' not in jobs[childid]: continue
                                else: childcount+=1
                        sendstr = sendstr[:-2]
                        sendstr += ',"children":'+str(childcount)+'},'
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'getimportmeta': #send extra data for main import file
                jobid = form.getvalue('id','')
                if not jobid:
                    sendOK(self)
                    return
                metapath = 'analyses/'+jobid+'/importmeta.txt'
                sendstr = open(metapath).read() if os.path.isfile(metapath) else '{}'
                sendOK(self)
                self.wfile.write(sendstr)
            elif action == 'getdir': #send directory filelist
                path = form.getvalue('dir','')
                if not os.path.isdir(path):
                    sendOK(self)
                    return
                sendstr = ''
                for item in os.listdir(path):
                    if item.startswith("."): continue
                    itempath = apath(path+'/'+item)
                    fsize = "folder" if os.path.isdir(itempath) else os.path.getsize(itempath)
                    sendstr += item+':'+str(fsize)+'|'
                sendstr = sendstr[:-1] #strip last '|'
                sendOK(self)
                self.wfile.write(sendstr)
            elif action == 'rmdir': #remove data dir
                jobid = form.getvalue('id','tmp')
                shutil.rmtree(apath('analyses/'+jobid))
                if jobid in jobs: del jobs[jobid]
                sendOK(self)
                self.wfile.write('Deleted');
            elif action == 'terminate': #kill a running job
                jobid = form.getvalue('id','tmp')
                if jobid in jobs:
                    popen = jobs[jobid]['popen']
                    if popen.poll() is None: popen.terminate()
                sendOK(self)
                self.wfile.write('Terminated')
            elif action == 'makefile': #write file to disk and send back
                filename = form.getvalue('filename','exported_data.txt')
                filedata = form.getvalue('filedata','')
                filepath = apath('exports/'+filename)
                exportfile = open(filepath,'w')
                exportfile.write(filedata)
                sendOK(self)
                self.wfile.write('exports/'+filename)
                for filename in os.listdir('exports'): #remove old files (>2 days)
                    filestat = os.stat(apath('exports/'+filename))
                    filetime = filestat.st_mtime
                    curtime = time.time()
                    fileage = (curtime-filetime)/86400
                    if(fileage > 2): os.remove(apath('exports/'+filename))
                
        except IOError as e:
            if hasattr(e, 'reason'):
                self.send_error(501,'URL does not exist: %s' % e.reason)
            elif hasattr(e, 'code'):
                self.send_error(e.code,'Server error: %s' % e.read())
        except OSError as e:
            self.send_error(501,'System error: %s' % e.strerror)
            
class MultiThreadServer(ThreadingMixIn, HTTPServer): #subclass for multithread support
    allow_reuse_address = True #server can be restarted even when port left open
    
    def __init__(self, *args):
        HTTPServer.__init__(self,*args)
        
    def process_request_thread(self, request, client_address):
        try:
            self.finish_request(request, client_address)
            self.close_request(request)
        except socket.error, e:
            print 'Error: Browser closed connection without waiting for server. Try again.'

def main():
    try:
        server = MultiThreadServer(('',8000), LocalServer)
        print "\nStarted local HTTP server at port 8000…\nPress CRTL+C to stop the server.\n"
        server.serve_forever()
    except KeyboardInterrupt:
        print '\nShutting down server.'
        server.socket.close()

if __name__ == '__main__':
    main()