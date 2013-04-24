import cgitb  #debugger
cgitb.enable()

ctype, pdict = cgi.parse_header(self.headers.getheader('content-type'))
            length = int(self.headers.getheader('content-length'))
            if ctype == 'multipart/form-data':
                query = cgi.parse_multipart(self.rfile, pdict)
            elif ctype == 'application/x-www-form-urlencoded':
                qs = self.rfile.read(length)
                query = cgi.parse_qs(qs, keep_blank_values=1)
            else:  #unknown content type
                print 'Unknown content-type: '+ctype
                pass
            #throw away additional data (python bug #427345)
            #while select.select([self.rfile._sock], [], [], 0)[0]:
            #    if not self.rfile._sock.recv(1): break    
            self.send_response(200)
            self.end_headers()
            action = query.get('action')
            self.wfile.write('action:'+action+',ID:'+12434)
            #upfilecontent = query.get('upfile')
            #self.wfile.write(upfilecontent[0]) #echo file back
            
            
            
            ###########
            fs = cgi.FieldStorage( fp = self.rfile, 
            headers = self.headers, environ={ 'REQUEST_METHOD':'POST' }) # all the rest will come from the 'headers' object, but as the FieldStorage object was designed for CGI, 
           										  #absence of 'POST' value in environ will prevent the object from using the 'fp' argument !     
             fs_up = fs['upfile']
             filename = os.path.split(fs_up.filename)[1] # strip the path, if it presents     
             fullname = os.path.join(CWD, filename)
 

            # check for copies :     
             if os.path.exists( fullname ):     
                 fullname_test = fullname + '.copy'
                 i = 0
                 while os.path.exists( fullname_test ):
                     fullname_test = "%s.copy(%d)" % (fullname, i)
                     i += 1
                 fullname = fullname_test
                 
             if not os.path.exists(fullname):
                 with open(fullname, 'wb') as o:
                     # self.copyfile(fs['upfile'].file, o)
                     o.write( fs_up.file.read() )     
 

            self.send_response(200)
 

            self.end_headers()
            
            
            
##########download file:
            
 import urllib2

urlfile = urllib2.urlopen("http://www.google.com")

data_list = []
chunk = 4096
while 1:
    data = urlfile.read(chunk)
    if not data:
        print "done."
        break
    data_list.append(data)
    print "Read %s bytes"%len(data)

return "".join(data)




#####subprocess:

import subprocess

pipe = subprocess.PIPE
popen = subprocess.Popen('pythonw -uB test_web_app.py', stdout=pipe, stderr=pipe)
out,err = popen.communicate() #capture output & wait for finish
if err: print err
pid = popen.pid
status = popen.poll() #0=finished;None=running
popen.kill()
