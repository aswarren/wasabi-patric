#Andres Veidenberg 2012
import os,string,random,cgi,urllib2,subprocess,time,json
from BaseHTTPServer import BaseHTTPRequestHandler, HTTPServer

apath = os.path.abspath
jobs = {}
def sendOK(self):
    self.send_response(200)
    self.send_header("Content-type", "text/plain")
    self.end_headers()
    
class MyHandler(BaseHTTPRequestHandler):
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
            
        except IOError:
            self.send_error(404,'File Not Found: %s' % url)

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
                aligner = 'prank' #try calling globally. use supplied aligner if fails
                try: call = subprocess.call(aligner,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
                except OSError: aligner = apath('aligners/'+aligner)
                jobid = ''.join(random.choice(string.letters + string.digits) for i in range(10))
                odir = 'output/'+jobid+'/'
                os.mkdir(odir)
                params = [aligner,'-d='+apath(odir+'input.fas'),'-o='+apath(odir+'out'),'-prunetree']
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
                    if 'anchor' not in form: params.append('-noanchors')
                    logpath = odir+'out.log'
                    logfile = open(apath(logpath), 'w')
                    popen = subprocess.Popen(params, stdout=logfile, stderr=logfile)
                    starttime = time.time()
                    status = popen.poll()
                    status = str(status) if status else 'running' #0=finished;None=running
                    logline = ' '
                    metapath = apath(odir+'meta.txt')
                    metafile = open(metapath, 'w')
                    jobs[jobid] = {'popen':popen,'starttime':starttime,'name':name,'logpath':logpath,'metapath':metapath}
                    jobdata = {"id":jobid,"name":name,"aligner":aligner,"parameters":",".join(params),"infile":inpath,"logfile":logpath,"starttime":starttime}
                    json.dump(jobdata,metafile) #write data to file
                    jobdata["status"] = status
                    jobdata["lasttime"] = starttime
                    datastring = json.dumps(jobdata);
                    sendOK(self)
                    #json.dump(jobdata,self.wfile)
                    self.wfile.write(datastring)
                elif action == 'export':
                    params.append('-convert') #convert fasta file with prank
                    fileformat = form.getvalue('fileformat','')
                    pipe = subprocess.PIPE
                    popen = subprocess.Popen(params, stdout=pipe, stderr=pipe)
                    out,err = popen.communicate() #wait for process to end & get output
                    if err:
                        self.send_error(501,'Covnert failed: %s' % err)
                        return
                    filelist = os.listdir(apath(odir))
                    findex = (i for i in filelist if i.startswith("out"))
                    outpath = apath(odir+filelist[findex])
                    if not os.path.isfile(outpath):
                        self.send_error(404,'Converted file not found: %s' % outpath)
                        return
                    sendOK(self)
                    self.wfile.write(odir+filelist[findex])
            elif action == 'alignstatus' or action == 'terminate': #send status or terminate registered job(s)
                getid = form.getvalue('id','')
                sendstr = ''
                for jobid in jobs:
                    if getid and jobid is not getid: continue #get a specific job
                    job = jobs[jobid]
                    popen = job['popen']
                    status = popen.poll()
                    if action == 'terminate' and status is None: popen.kill()
                    status = popen.poll()
                    status = 'running' if status is None else str(status)
                    name = job['name']
                    starttime = job['starttime']
                    outpath = ''
                    if 'endtime' not in job: #job endtime not registered   
                        logpath = job['logpath']
                        if not os.path.isfile(logpath): continue
                        logstat = os.stat(logpath)
                        filetime = logstat.st_mtime
                        logfile = open(logpath)
                        lastline = ' '
                        for logline in logfile: #get last logline
                            logline = logline.strip()
                            if len(logline)==0: continue
                            elif "\b" in logline: #remove backspace
                                logline = logline.translate(string.maketrans("\b", "|"))
                                splitted = logline.split("|")
                                lastline = splitted[len(splitted)-1]
                            else: lastline = logline
                        if status is not 'running': #write job endstatus to metafile
                            odir = 'output/'+jobid+'/'
                            outpath = odir+'out.2.xml' if os.path.isfile(odir+'out.2.xml') else odir+'out.1.xml'
                            jobs[jobid]['endtime'] = filetime
                            jobs[jobid]['outfile'] = outpath
                            metapath = job['metapath']
                            if not os.path.isfile(metapath): continue
                            jobdata = json.load(open(metapath))
                            jobdata['endtime'] = filetime
                            jobdata['endstatus'] = status
                            jobdata['outfile'] = outpath
                            json.dump(jobdata,open(metapath,'w'))
                    sendstr += '{"id":"%s","name":"%s","status":"%s","starttime":"%d","lasttime":"%s","log":"%s","outfile":"%s","logfile":"%s"},' % (jobid,name,status,starttime,filetime,lastline,outpath,logpath)
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'writemeta': #add data to job metadata file
                jobid = form.getvalue('id')
                key = form.getvalue('key')
                value = form.getvalue('value',time.time())
                metapath = apath('output/'+jobid+'/meta.txt')
                if not jobid or not key or not os.path.isfile(metapath):
                    sendOK(self)
                    return
                if jobid in jobs: jobs[jobid][key] = value
                jobdata = json.load(open(metapath))
                jobdata[key] = value
                json.dump(jobdata,open(metapath,'w'))
                sendOK(self)
                json.dump(jobdata,self.wfile)
            elif action == 'getmeta': #get data for all imported jobs in output folder
                sendstr = ''
                for dirname in os.listdir('output'):
                    metapath = apath('output/'+dirname+'/meta.txt')
                    if not os.path.isfile(metapath): continue
                    if dirname in jobs and 'imported' not in jobs[dirname]: continue #a running job
                    sendstr += open(metapath).read()+','
                if sendstr is not '': sendstr = sendstr[:-1]
                sendOK(self)
                self.wfile.write('['+sendstr+']')
            elif action == 'getdir' or action == 'rmdir': #send directory conent list or remove datafile dir
                path = form.getvalue('dir','')
                if action == 'rmdir': path = apath('output'+'/'+path)
                getsub = form.getvalue('subdir','')
                if not os.path.isdir(path):
                    sendOK(self)
                    return
                dirlist = os.listdir(path)
                sendstr = ''
                for itm in dirlist:
                    fsize = os.path.getsize(apath(path+'/'+itm))
                    subpath = apath(path+'/'+itm)
                    if action == 'rmdir' and os.path.isfile(subpath): os.remove(subpath)
                    if getsub and os.path.isdir(subpath): #send only 2.level dirlist
                        sublist = os.listdir(subpath)
                        for subitm in sublist:
                            fsize = os.path.getsize(apath(subpath+'/'+subitm))
                            sendstr += "%s:%d|" % (itm+'/'+subitm,fsize)
                    else: sendstr += "%s:%d|" % (itm,fsize)
                if action == 'rmdir': os.rmdir(path)
                sendstr = sendstr[:-1] #strip last '|'
                sendOK(self)
                self.wfile.write(sendstr)
                
        except IOError, e:
            if hasattr(e, 'reason'):
                self.send_error(501,'URL does not exist: %s' % e.reason)
            elif hasattr(e, 'code'):
                self.send_error(e.code,'Server error: %s' % e.read())
        except OSError, e:
            self.send_error(501,'System error: %s' % e.strerror)

def main():
    try:
        server = HTTPServer(('', 8000), MyHandler)
        print 'started httpserver at port 8000...'
        server.serve_forever()
    except KeyboardInterrupt:
        print '^C received, shutting down server'
        server.socket.close()

if __name__ == '__main__':
    main()