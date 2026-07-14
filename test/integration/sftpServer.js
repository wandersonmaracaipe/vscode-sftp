// A minimal in-process SFTP server (ssh2) backed by a real directory, just
// enough to exercise SFTPFileSystem end-to-end. Not a hardened server — for
// tests only.
const fs = require('fs');
const path = require('path');
const { Server, utils } = require('ssh2');

const { STATUS_CODE } = utils.sftp;
const { flagsToString } = utils.sftp;

function toAttrs(st) {
  return {
    mode: st.mode,
    uid: st.uid,
    gid: st.gid,
    size: st.size,
    atime: Math.floor(st.atimeMs / 1000),
    mtime: Math.floor(st.mtimeMs / 1000),
  };
}

// Start an SFTP server rooted at `root`. Returns { server, port, hostKey } and
// resolves once it's listening. Accepts any username/password.
function startSftpServer(root) {
  const hostKey = utils.generateKeyPairSync('rsa', { bits: 2048 }).private;

  const handles = new Map();
  let handleSeq = 0;
  const makeHandle = value => {
    const id = handleSeq++;
    handles.set(id, value);
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(id, 0);
    return buf;
  };
  const readHandle = buf => handles.get(buf.readUInt32BE(0));
  const dropHandle = buf => handles.delete(buf.readUInt32BE(0));

  const resolve = p => path.join(root, p.replace(/^\/+/, ''));

  const server = new Server({ hostKeys: [hostKey] }, client => {
    // A client that rejects our host key aborts the key exchange, which the
    // Server surfaces as an 'error' event. Without a listener that becomes an
    // unhandled 'error' and takes the whole test process down — so swallow it:
    // the client-side assertion is what the host-key tests are checking.
    client.on('error', () => {});
    client.on('authentication', ctx => ctx.accept());
    client.on('ready', () => {
      client.on('session', accept => {
        const session = accept();
        session.on('sftp', acceptSftp => {
          const sftp = acceptSftp();
          const ok = (reqid, code = STATUS_CODE.OK) => sftp.status(reqid, code);
          const fail = reqid => sftp.status(reqid, STATUS_CODE.FAILURE);

          sftp.on('REALPATH', (reqid, p) => {
            const abs = '/' + p.replace(/^\/+/, '');
            sftp.name(reqid, [{ filename: abs, longname: abs, attrs: {} }]);
          });

          sftp.on('OPEN', (reqid, filename, flags, _attrs) => {
            fs.open(resolve(filename), flagsToString(flags) || 'r', (err, fd) => {
              if (err) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              sftp.handle(reqid, makeHandle({ type: 'file', fd, path: filename }));
            });
          });

          sftp.on('READ', (reqid, handle, offset, length) => {
            const h = readHandle(handle);
            if (!h || h.type !== 'file') return fail(reqid);
            const buf = Buffer.alloc(length);
            fs.read(h.fd, buf, 0, length, offset, (err, bytesRead) => {
              if (err) return fail(reqid);
              if (bytesRead === 0) return sftp.status(reqid, STATUS_CODE.EOF);
              sftp.data(reqid, buf.slice(0, bytesRead));
            });
          });

          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const h = readHandle(handle);
            if (!h || h.type !== 'file') return fail(reqid);
            fs.write(h.fd, data, 0, data.length, offset, err =>
              err ? fail(reqid) : ok(reqid)
            );
          });

          sftp.on('FSTAT', (reqid, handle) => {
            const h = readHandle(handle);
            if (!h || h.type !== 'file') return fail(reqid);
            fs.fstat(h.fd, (err, st) => (err ? fail(reqid) : sftp.attrs(reqid, toAttrs(st))));
          });

          sftp.on('FSETSTAT', (reqid) => ok(reqid));
          sftp.on('SETSTAT', (reqid) => ok(reqid));

          sftp.on('CLOSE', (reqid, handle) => {
            const h = readHandle(handle);
            dropHandle(handle);
            if (h && h.type === 'file') {
              return fs.close(h.fd, err => (err ? fail(reqid) : ok(reqid)));
            }
            ok(reqid);
          });

          sftp.on('OPENDIR', (reqid, p) => {
            fs.stat(resolve(p), (err, st) => {
              if (err || !st.isDirectory()) return sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
              sftp.handle(reqid, makeHandle({ type: 'dir', path: p, read: false }));
            });
          });

          sftp.on('READDIR', (reqid, handle) => {
            const h = readHandle(handle);
            if (!h || h.type !== 'dir') return fail(reqid);
            if (h.read) return sftp.status(reqid, STATUS_CODE.EOF);
            h.read = true;
            fs.readdir(resolve(h.path), (err, files) => {
              if (err) return fail(reqid);
              const names = files.map(name => {
                let attrs = {};
                try {
                  attrs = toAttrs(fs.lstatSync(path.join(resolve(h.path), name)));
                } catch (_e) {
                  /* ignore */
                }
                return { filename: name, longname: name, attrs };
              });
              sftp.name(reqid, names);
            });
          });

          sftp.on('LSTAT', (reqid, p) => {
            fs.lstat(resolve(p), (err, st) =>
              err ? sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE) : sftp.attrs(reqid, toAttrs(st))
            );
          });

          sftp.on('STAT', (reqid, p) => {
            fs.stat(resolve(p), (err, st) =>
              err ? sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE) : sftp.attrs(reqid, toAttrs(st))
            );
          });

          sftp.on('MKDIR', (reqid, p) =>
            fs.mkdir(resolve(p), err => (err ? fail(reqid) : ok(reqid)))
          );
          sftp.on('RMDIR', (reqid, p) =>
            fs.rmdir(resolve(p), err => (err ? fail(reqid) : ok(reqid)))
          );
          sftp.on('REMOVE', (reqid, p) =>
            fs.unlink(resolve(p), err => (err ? fail(reqid) : ok(reqid)))
          );
          sftp.on('RENAME', (reqid, from, to) =>
            fs.rename(resolve(from), resolve(to), err => (err ? fail(reqid) : ok(reqid)))
          );
          sftp.on('READLINK', (reqid, p) =>
            fs.readlink(resolve(p), (err, link) =>
              err ? fail(reqid) : sftp.name(reqid, [{ filename: link, longname: link, attrs: {} }])
            )
          );
        });
      });
    });
  });

  return new Promise(resolvePromise => {
    server.listen(0, '127.0.0.1', function () {
      resolvePromise({ server, port: this.address().port });
    });
  });
}

module.exports = { startSftpServer };
