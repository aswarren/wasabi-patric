#Andres Veidenberg 2012
#coding: utf-8
import os,string,random,cgi,urllib2,subprocess,time,json,socket,shutil
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer
from SocketServer import ThreadingMixIn

apath = os.path.abspath
jobs = {}
def sendOK(self):
    self.send_response(200)
    self.send_header("Content-type", "text/plain")
    self.end_headers()
    
class LocalServer(BaseHTTPRequestHandler): #class to handle local server/browser communication
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
            
            if url.endswith(".html") | url.endswith(".css") | url.endswith(".js"): #send html page
                type = 'text/css' if url.endswith(".css") else 'text/javascript' if url.endswith(".js") else 'text/html'
                f = open(apath(url)) #this potentially makes every file on your computer readable from browser
            else: #default: just send the file
                type = 'image' if url.endswith(".jpg")|url.endswith(".png")|url.endswith(".gif") else 'application/octet-stream'
                f = open(apath(url), 'rb')
            filecontent = f.read()
            self.send_response(200)
            self.send_header('Content-type', type)
            self.send_header("Content-length", len(filecontent))
            self.end_headers()
            self.wfile.write(filecontent)
            f.close()
            return
            
        except IOError as e:
            self.send_error(404,'File Not Found: %s (%d: %s)' % (url,e.errno,e.strerror))

    def do_POST(self): #ajax request or file sent to server
        global rootnode
        try:
            form = cgi.FieldStorage(fp = self.rfile, headers = self.headers, environ={'REQUEST_METHOD':'POST'})
            action = form.getvalue('action')
            if action == 'echofile':  #echo uploaded file back
                sendOK(self)
                self.wfile.write(form.getvalue('upfile'))
            elif action == 'geturl':  #download & send remote files
                urlfile = urllib2.urlopen(form.getvalue('fileurl'))
                sendOK(self)
                self.wfile.write(urlfile.read())
            elif (action == 'startalign') | (action == 'export'):
                alignerpath = apath('aligners/prank/prank') #Use supplied aligner binary, global install as a fallback.
                try: call = subprocess.call(alignerpath,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                except OSError: alignerpath = 'prank'
                aligner = 'PRANK:'+alignerpath
                jobid = ''.join(random.choice(string.letters + string.digits) for i in range(10))
                odir = 'analyses/'+jobid+'/'
                os.mkdir(odir)
                params = [alignerpath,'-d='+apath(odir+'input.fas'),'-o='+apath(odir+'out'),'-prunetree']
                inpath = apath(odir+'input.fas')
                fafile = open(inpath, 'w')
                fafile.write(form.getvalue('fasta',''))
                if 'newick' in form:
                    treefile = open(apath(odir+'input.tree'), 'w')
                    treefile.write(form.getvalue('newick',''))
                    params.append('-t='+apath(odir+'input.tree'))
                if action == 'startalign':
                    name = form.getvalue('name','')
                    params.append('-showxml')
                    if 'F' in form: params.append('+F')
                    if 'e' in form: params.append('-e')
                    if 'dots' in form: params.append('-dots')
                    if 'anchor' not in form: params.append('-noanchors')
                    logpath = odir+'out.log'
                    logfile = open(apath(logpath), 'w')
                    popen = subprocess.Popen(params, stdout=logfile, stderr=logfile)
                    starttime = str(time.time())
                    status = popen.poll()
                    status = str(status) if status else 'running' #0=finished;None=running
                    logline = ' '
                    metapath = apath(odir+'meta.txt')
                    metafile = open(metapath, 'w')
                    jobs[jobid] = {'popen':popen,'starttime':starttime,'name':name,'logpath':logpath,'metapath':metapath,'order':str(len(jobs))}
                    jobdata = {"id":jobid,"name":name,"aligner":aligner,"parameters":",".join(params[1:]),"infile":inpath,"logfile":logpath,"starttime":starttime}
                    json.dump(jobdata,metafile) #write data to file
                    jobdata["status"] = status
                    jobdata["lasttime"] = starttime
                    #datastring = json.dumps(jobdata)
                    sendOK(self)
                    json.dump(jobdata,self.wfile)
                    #self.wfile.write(datastring)
                elif action == 'export':
                    params.append('-convert') #convert fasta file with prank
                    fileformat = form.getvalue('fileformat','')
                    params.append('-format '+fileformat)
                    pipe = subprocess.PIPE
                    popen = subprocess.Popen(params, stdout=pipe, stderr=pipe)
                    out,err = popen.communicate() #wait for process to end & get output
                    if err:
                        self.send_error(501,'Convert failed: %s' % err)
                        return
                    filelist = os.listdir(apath(odir))
                    findex = (i for i in filelist if i.startswith("out"))
                    outpath = apath(odir+filelist[findex])
                    if not os.path.isfile(outpath):
                        self.send_error(404,'Converted file not found: %s' % outpath)
                        return
                    sendOK(self)
                    self.wfile.write(odir+filelist[findex])
            elif action == 'alignstatus': #send status or terminate registered job(s)
                getid = form.getvalue('id','')
                sendstr = ''
                for jobid in jobs:
                    job = jobs[jobid]
                    if getid and jobid is not getid: continue #get a specific job
                    #if 'imported' in job: continue #skip imported data
                    imported = job.get('imported','')
                    order = job['order']
                    popen = job['popen']
                    status = popen.poll()
                    status = 'running' if status is None else str(status)
                    name = job['name']
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
                    sendstr += '{"id":"'+jobid+'","name":"'+name+'","status":"'+status+'","starttime":"'+starttime+'","endtime":"'+endtime+'","savetime":"'+endtime+'","lasttime":"'+filetime+'","log":"'+lastline+'","outfile":"'+outpath+'","logfile":"'+logpath+'","order":"'+order+'","imported":"'+imported+'"},'
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'writemeta': #add data to job metadata file
                jobid = form.getvalue('id')
                key = form.getvalue('key')
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
                for dirname in os.listdir('analyses'):
                    metapath = apath('analyses/'+dirname+'/meta.txt')
                    if not os.path.isfile(metapath): continue
                    if dirname in jobs and 'imported' not in jobs[dirname]: continue #a running job
                    sendstr += open(metapath).read()+','
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'getdir': #send directory conent list
                path = form.getvalue('dir','')
                getsub = form.getvalue('subdir','')
                if not os.path.isdir(path):
                    sendOK(self)
                    return
                dirlist = os.listdir(path)
                sendstr = ''
                for itm in dirlist:
                    fsize = os.path.getsize(apath(path+'/'+itm))
                    subpath = apath(path+'/'+itm)
                    if getsub and os.path.isdir(subpath): #send only 2.level dirlist
                        sublist = os.listdir(subpath)
                        for subitm in sublist:
                            fsize = os.path.getsize(apath(subpath+'/'+subitm))
                            sendstr += "%s:%d|" % (itm+'/'+subitm,fsize)
                    else: sendstr += "%s:%d|" % (itm,fsize)
                sendstr = sendstr[:-1] #strip last '|'
                sendOK(self)
                self.wfile.write(sendstr)
            elif action == 'rmdir': #remove data dir
                jobid = form.getvalue('id','tmp')
                shutil.rmtree(apath('analyses/'+jobid))
                if jobid in jobs: del jobs[jobid]
                sendOK(self)
                self.wfile.write('Deleted')
            elif action == 'terminate':
                jobid = form.getvalue('id','tmp')
                if jobid in jobs:
                    popen = jobs[jobid]['popen']
                    if popen.poll() is None: popen.terminate()
                sendOK(self)
                self.wfile.write('Terminated')
            elif action == 'makefile': #write file to disk
                jobid = form.getvalue('id',False)
                filename = form.getvalue('filename','export.txt')
                filedata = form.getvalue('filedata','')
                filepath = apath('analyses/'+jobid+'/'+filename) if jobid else apath('exports/'+filename)
                exportfile = open(filepath,'w')
                exportfile.write(filedata)
                sendOK(self)
                self.wfile.write('{file:"'+filepath+'"}')
                
        except IOError as e:
            if hasattr(e, 'reason'):
                self.send_error(501,'URL does not exist: %s' % e.reason)
            elif hasattr(e, 'code'):
                self.send_error(e.code,'Server error: %s' % e.read())
        except OSError as e:
            self.send_error(501,'System error: %s' % e.strerror)
            
class MultiThreadServer(ThreadingMixIn, HTTPServer): #subclass for multithread support
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