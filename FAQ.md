- [Erro: Failure](#erro-failure)
	- [Erro: Failure - Solução Um](#erro-failure---solução-um)
	- [Erro: Failure - Solução Dois](#erro-failure---solução-dois)
- [Erro: Conexão fechada](#erro-conexão-fechada)
- [A extensão parou de enviar / "Client is closed"](#a-extensão-parou-de-enviar--client-is-closed)
- [O envio automático parou / "501 No directory name"](#o-envio-automático-parou--501-no-directory-name)
- [Arquivos temporários do editor sendo enviados](#arquivos-temporários-do-editor-sendo-enviados)
- [Erro: Clicar em "Upload Changed Files" não funciona](#erro-clicar-em-upload-changed-files-não-funciona)
- [ENFILE: file table overflow ...](#enfile-file-table-overflow-)
	- [ENFILE: file table overflow ... - Solução para o limite rígido do MacOS](#enfile-file-table-overflow----solução-para-o-limite-rígido-do-macos)
- [Como faço upload do conteúdo de dentro de uma pasta, mas não da pasta em si?](#como-faço-upload-do-conteúdo-de-dentro-de-uma-pasta-mas-não-da-pasta-em-si)
- [Como posso enviar arquivos como root?](#como-posso-enviar-arquivos-como-root)
- [Sincronizar automaticamente nos dois sentidos sem interação do usuário](#sincronizar-automaticamente-nos-dois-sentidos-sem-interação-do-usuário)
- [Exibir dotfiles/arquivos ocultos no remote explorer](#exibir-dotfilesarquivos-ocultos-no-remote-explorer)

## Erro: Failure

A mensagem de erro "failure" vem do lado remoto e é mais ou menos a mensagem de erro padrão/genérica 
que o servidor sftp envia quando uma syscall falha ou algo semelhante acontece.
Para saber exatamente o que está dando errado, você pode tentar habilitar a saída de depuração do servidor sftp 
e então executar suas transferências novamente e ver o que (se houver algo) aparece nos logs de lá.

### Erro: Failure - Solução Um

Altere `remotePath` para o caminho real se ele for um symlink.

### Erro: Failure - Solução Dois

O problema pode ser que o seu servidor esteja ficando sem file descriptors.
Você deve tentar aumentar o limite de file descriptors.
Se você não tiver permissão para fazer isso, defina a opção [limitOpenFilesOnRemote](docs/configuration.md#limitopenfilesonremote) na sua configuração.

## Erro: Conexão fechada

O problema pode ser que a extensão SFTP fique fechando a conexão para quem usa sistemas mais legados/antigos.
Você terá que substituir explicitamente os algoritmos padrão da camada de transporte usados na conexão para remover o novo algoritmo `"diffie-hellman-group-exchange-sha256"`, que causa o problema, da seção `kex`. Basta adicionar isto no seu arquivo de configuração `sftp.json`, o que deve fazer funcionar.
```json
{
	"algorithms": {
		"kex": [
			"ecdh-sha2-nistp256", 
			"ecdh-sha2-nistp384", 
			"ecdh-sha2-nistp521"
		],
		"cipher": [
			"aes128-gcm",
			"aes128-gcm@openssh.com",
			"aes256-gcm",
			"aes256-gcm@openssh.com",
			"aes128-cbc",
			"aes192-cbc",
			"aes256-cbc",
			"aes128-ctr",
			"aes192-ctr",
			"aes256-ctr"
		],
		"serverHostKey": [
			"ssh-rsa", 
			"ssh-dss",
			"ssh-ed25519",
			"ecdsa-sha2-nistp256", 
			"ecdsa-sha2-nistp384", 
			"ecdsa-sha2-nistp521",
			"rsa-sha2-256",
			"rsa-sha2-512"
		],
		"hmac": [
			"hmac-sha2-256", 
			"hmac-sha2-512"
		]
	}
}
```

## A extensão parou de enviar / "Client is closed"

**Sintoma:** o envio automático funciona por um tempo e, de repente, **para de vez**. A partir daí, todo envio, download ou salvamento falha com a mesma mensagem repetida no log:

```
Error: Client is closed because ENOENT: no such file or directory, open '...'
Closing reason: Error: ENOENT: no such file or directory, open '...'
```

Recarregar a janela do VS Code resolve — até acontecer de novo.

**Corrigido na 1.22.1.** Se você está numa versão anterior, **atualize**.

O que acontecia: quando a conexão FTP era derrubada por um erro (tipicamente um arquivo temporário que some no meio do envio), a extensão não percebia a queda e continuava reutilizando a **conexão morta** indefinidamente. Um único erro travava tudo até recarregar a janela.

A causa era sutil: a detecção de queda dependia dos eventos do socket, mas o `basic-ftp` remove todos os listeners **antes** de destruir o socket ao encerrar por erro — então o aviso nunca chegava. Agora o estado é consultado diretamente no cliente, sem depender de eventos, e uma conexão morta é substituída automaticamente na operação seguinte.

Se você ainda vir isso na 1.22.1 ou posterior, [abra uma issue](https://github.com/wandersonmaracaipe/vscode-sftp/issues) com o log (`sftp.debug` em `true`).

## O envio automático parou / "501 No directory name"

**Sintoma:** o envio automático (ao salvar / observador) **para de funcionar**, mas **"Sincronizar Pasta"** continua funcionando. No log aparece algo como:

```
[error] i: 501 No directory name
    at t.FTPContext._onControlSocketData (...)
    ... upload c:\Projetos\Minha Pasta
```

Fechar e reabrir o editor resolve — até acontecer de novo.

**Corrigido na 1.23.1.** Eram duas causas somadas:

1. **`501 No directory name`** — ao garantir que a pasta de destino existe, a extensão subia a árvore de diretórios criando cada nível, e ia **um nível além**: acabava pedindo `MKD /` (criar a raiz). O servidor responde `501 No directory name`, e esse erro derrubava a transferência inteira. Agora a raiz nunca é criada — ela já existe — e uma pasta que o servidor recusa por já existir (cada servidor responde com um código diferente) é aceita depois de conferir com um `list`.

2. **A pasta inteira sendo reenviada** — a data de modificação de uma pasta muda sempre que qualquer arquivo dentro dela muda, e o observador tratava esse evento como "envie esta pasta": um `upload` **recursivo do projeto todo** a cada arquivo salvo. Em FTP, onde as transferências são serializadas, isso ocupava a fila por muito tempo e os salvamentos seguintes ficavam esperando — parecia que o envio automático tinha morrido. Agora só uma pasta **recém-criada** é enviada; mudanças dentro dela chegam pelos eventos dos próprios arquivos.

Junto vieram três proteções para que **nenhum** erro possa deixar a extensão parada até reiniciar:

* Uma conexão que trava (por exemplo, um pedido de senha que ninguém responde) é abandonada depois de um tempo-limite, em vez de deixar toda operação seguinte esperando por ela para sempre.
* Uma remessa do observador que não termina deixa de bloquear as próximas.
* Novo comando **"SFTP: Reconectar (reiniciar conexões)"** — descarta todas as conexões e transferências pendentes. Se algo travar, use-o em vez de reiniciar o editor.

## Arquivos temporários do editor sendo enviados

**Sintoma:** o log mostra envios de arquivos com nomes estranhos, como `arquivo.php.tmp.10652.f7a7479f0125` ou `arquivo.php.vsctmp`, quase sempre seguidos de um erro `ENOENT`.

Esses arquivos são criados pelo editor durante o "salvamento atômico": ele grava o conteúdo num arquivo temporário e depois o renomeia por cima do arquivo real. Eles existem por milissegundos — quando o envio começa, o arquivo já sumiu.

Com o `watcher.files` em `"**/*"`, o observador enxerga esses arquivos e tenta enviá-los. **Desde a 1.22.1** eles são ignorados por padrão (`*.tmp.*`, `*.vsctmp`, `*.swp`, `*~`).

Se você definiu o seu próprio `ignore` no `sftp.json`, a sua lista **substitui** o padrão — então inclua esses padrões você mesmo:

```json
{
  "ignore": [
    ".git",
    "node_modules",
    "*.tmp.*",
    "*.vsctmp",
    "*.swp",
    "*~"
  ]
}
```

## Erro: Clicar em "Upload Changed Files" não funciona

Veja [vscode-sftp issue #854](https://github.com/liximomo/vscode-sftp/issues/854).

**@PaPa31** adicionou uma correção para tornar o comando 'Upload Changed Files' visível e adicionou um atalho de teclado padrão para acioná-lo.
<!-- **danieleiobbi** tem uma solução alternativa para criar um atalho de teclado. -->

![atalho de teclado para upload changed files](assets/faq/upload_changed_files_shortcut.png)

## ENFILE: file table overflow ...

O MacOS tem um limite rígido no número de arquivos abertos.

### ENFILE: file table overflow ... - Solução para o limite rígido do MacOS

Execute estes comandos:
```sh
echo kern.maxfiles=65536 | sudo tee -a /etc/sysctl.conf
echo kern.maxfilesperproc=65536 | sudo tee -a /etc/sysctl.conf
sudo sysctl -w kern.maxfiles=65536
sudo sysctl -w kern.maxfilesperproc=65536
ulimit -n 65536
```

## Como faço upload do conteúdo de dentro de uma pasta, mas não da pasta em si?

Veja [vscode-sftp issue #852](https://github.com/liximomo/vscode-sftp/issues/852).

Como citado por **raoul2000**, "desde que você defina a propriedade `context` como `./[path]` (por exemplo, `./build`), 
vai funcionar."

Exemplo de configuração (onde todos os arquivos JS e HTML em `./build` serão copiados para `/folder1/folder2/folder3`):
```json
{
  "name": "My Server",
  "host": "<host_ip_address>",
  "protocol": "sftp",
  "port": 22,
  "username": "user1",
  "remotePath": "/folder1/folder2/folder3",
  "context": "./build",
  "uploadOnSave": false,
  "watcher": {
    "files": "*.{js,html}",
    "autoUpload": true,
    "autoDelete": false
  }
}
```

## Como posso enviar arquivos como root?

Veja [vscode-sftp issue #559](https://github.com/liximomo/vscode-sftp/issues/559).

**Yevhen-development** tem uma solução alternativa, mas ela pode não funcionar para todos. No `sftp.json`, defina o
seguinte:
```json
"sshCustomParams": "sudo su -;"
```

## Sincronizar automaticamente nos dois sentidos sem interação do usuário

Veja [vscode-sftp issue #136](https://github.com/Natizyskunk/vscode-sftp/issues/136).

> *Isto também pode ser usado com o **GIT** desta forma: quando você faz checkout de um branch ou reverte alterações/commits, o seu servidor também será atualizado.*

```json
{
  "name": "My Server",
  "host": "<host_ip_address>",
  "protocol": "sftp",
  "port": 22,
  "username": "user1",
  "remotePath": "/folder1/folder2/folder3",
  "uploadOnSave": false, // Defina como false se o `autoUpload` do watcher estiver como true e `files` estiver como "**/*".
  "watcher": {
    "files": "**/*",
    "autoUpload": true,
    "autoDelete": true
  }
  "syncOption": {
    "delete": true // Exclui arquivos supérfluos dos diretórios de destino.
  },
}
```

## Exibir dotfiles/arquivos ocultos no remote explorer

### Se estiver usando proftpd

Edite o arquivo de configuração `proftpd.conf`. Dependendo da sua instalação, a localização padrão deste arquivo pode ser uma destas:
- `/etc/proftpd.conf`
- `/etc/proftpd/proftpd.conf`
- `/usr/local/etc/proftpd.conf`
- `/usr/local/etc/proftpd/proftpd.conf`

Procure pelo parâmetro `ListOptions` e altere-o de `"-l"` para `"-la"`.

Deve ficar assim: 
```conf
#Configurações globais
<Global>
[...]
ListOptions 		"-la"
[...]
</Global>
```
