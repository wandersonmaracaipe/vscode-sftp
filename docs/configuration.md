# VSCode-SFTP

As configurações são armazenadas no diretório de trabalho do seu projeto em `../.vscode/sftp.json`. <br>
O arquivo de configuração pode ser acessado a qualquer momento com `CTRL` + `Shift` + `P` e pesquisando por `SFTP: Config`.

![image](https://github.com/user-attachments/assets/5ceff350-7678-4264-98d4-2741a98a9dbe)

## Índice

### Configuração
- [name](#name)
- [context](#context)
- [protocol](#protocol)
- [host](#host)
- [port](#port)
- [username](#username)
- [password](#password)
- [remotePath](#remotepath)
- [filePerm](#fileperm)
- [dirPerm](#dirperm)
- [uploadOnSave](#uploadonsave)
- [useTempFile](#usetempfile)
- [openSsh](#openssh)
- [downloadOnOpen](#downloadonopen)
- [syncOption](#syncoption)
- [ignore](#ignore)
- [ignoreFile](#ignorefile)
- [watcher](#watcher)
- [remoteTimeOffsetInHours](#remotetimeoffsetinhours)
- [remoteExplorer](#remoteexplorer)
- [concurrency](#concurrency)
- [connectTimeout](#connecttimeout)
- [limitOpenFilesOnRemote](#limitopenfilesonremote)

### Configuração exclusiva de SFTP
- [agent](#agent)
- [privateKeyPath](#privatekeypath)
- [passphrase](#passphrase)
- [hostKeyChecking](#hostkeychecking)
- [knownHosts](#knownhosts)
- [interactiveAuth](#interactiveauth)
- [algorithms](#algorithms)
- [sshConfigPath](#sshconfigpath)
- [sshCustomParams](#sshcustomparams)

### Configuração exclusiva de FTP(s)
- [secure](#secure)
- [secureOptions](#secureoptions)



## Configuração

### name
Uma string para identificar sua configuração.

| Chave | Valor |
| --- | --- |
| *name* | *string* |

```json
{
  "name": "My Server"
}
```

### context
Um caminho relativo à pasta raiz do workspace. <br>
Use isto quando quiser mapear uma subpasta para o `remotePath`.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *context* | *string* | *A raiz do workspace.* |

```json
{
  "context": "/_subfolder_"
}
```

### protocol
Protocolo a ser utilizado.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *protocol* | `sftp` *ou* `ftp` | `sftp` |

```json
{
  "protocol": "sftp"
}
```

### host
Nome do host ou endereço IP do servidor.

| Chave | Valor |
| --- | --- |
| *host* | *string* |

```json
{
  "host": "server.example.com"
}
```

### port
Número da porta do servidor.

| Chave | Valor |
| --- | --- |
| *port* | *integer* |

```json
{
  "port": 22
}
```

### username
Nome de usuário para autenticação.

| Chave | Valor |
| --- | --- |
| *username* | *string* |

```json
{
  "username": "user1"
}
```

### password
[!WARNING]
**As senhas são armazenadas em texto puro!**

A senha para autenticação de usuário baseada em senha.

| Chave | Valor |
| --- | --- |
| *password* | *string* |

```json
{
  "password": "Password123"
}
```

### remotePath
O caminho absoluto no host remoto.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *remotePath* | *string* | `/` |

```json
{
  "remotePath": "/_subfolder_"
}
```

### filePerm
Define permissões octais de arquivo para novos arquivos.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *filePerm* | *number* | `false` |

```json
{
  "filePerm": 644
}
```
 
### dirPerm
Define permissões octais de diretório para novos diretórios.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *dirPerm* | *number* | `false` |

```json
{
  "dirPerm": 750
}
```

### uploadOnSave
Faz upload a cada operação de salvamento do VSCode.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *uploadOnSave* | *boolean* | `false` |

```json
{
  "uploadOnSave": true
}
```

### useTempFile
Faz upload de um arquivo temporário a cada operação de salvamento do VSCode para evitar quebrar uma página web quando um usuário a acessa enquanto o arquivo ainda está sendo enviado (está incompleto).

| Chave | Valor | Padrão |
| --- | --- | --- |
| *useTempFile* | *boolean* | `false` |

```json
{
  "useTempFile": true
}
```

### openSsh
Habilita uploads atômicos de arquivos (*suportado apenas por servidores openSSH*).

| 💡 Importante |
| :--- |
| *Se definido como* `true`*, a opção* `useTempFile` *também deve ser definida como* `true`.|

| Chave | Valor | Padrão |
| --- | --- | --- |
| *openSsh* | *boolean* | `false` |

```json
{
  "openSsh": true,
  "useTempFile": true
}
```

### downloadOnOpen
Baixa o arquivo do servidor remoto sempre que ele é aberto.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *downloadOnOpen* | *boolean* | `false` |

```json
{
  "downloadOnOpen": true
}
```

### syncOption
Configura o comportamento do comando `Sync`.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *syncOption* | *object* | `{}` |

#### syncOption.delete
Exclui arquivos supérfluos dos diretórios de destino.

| Chave | Valor |
| --- | --- |
| *syncOption.delete* | *boolean* |

#### syncOption.skipCreate
Ignora a criação de novos arquivos no destino.

| Chave | Valor |
| --- | --- |
| *syncOption.skipCreate* | *boolean* |

#### syncOption.ignoreExisting
Ignora a atualização de arquivos que já existem no destino.

| Chave | Valor |
| --- | --- |
| *syncOption.ignoreExisting* | *boolean* |

#### syncOption.update
Atualiza o destino apenas se houver uma versão mais recente no sistema de arquivos de origem.

| Chave | Valor |
| --- | --- |
| *syncOption.update* | *boolean* |

```json
{
  "syncOption": {
    "delete": true,
    "skipCreate": false,
    "ignoreExisting": false,
    "update": true
  },
}
```

### useTempFile
Faz upload de um arquivo temporário a cada operação de salvamento do VSCode para evitar quebrar uma página web quando um usuário a acessa enquanto o arquivo ainda está sendo enviado (está incompleto).

| Chave | Valor | Padrão |
| --- | --- | --- |
| *useTempFile* | *boolean* | `false` |

```json
{
  "useTempFile": true
}
```

### ignore
O ignore pode ser usado para ignorar arquivos e pastas na sincronização e ainda suporta curingas usando `*`. <br>
Este é o mesmo comportamento do gitignore, com todos os caminhos relativos ao context da configuração atual. <br>
Quando você **não** define `ignore`, um padrão sensato é aplicado para evitar sincronizar pastas pesadas/transitórias por acidente. Definir a sua própria lista **substitui** o padrão (não é mesclado).

| Chave | Valor | Padrão |
| --- | --- | --- |
| *ignore* | *string[]* | `['.vscode', '.git', '.DS_Store', 'node_modules']` |
 
```json
{
  "ignore": [
    "/.vscode",
    "/.git",
    "/.cache",
    "/_subfolder_",
    ".DS_Store",
    "*.gz",
    "*.log"
  ],
}
```

### ignoreFile
Caminho absoluto para o arquivo de ignore ou caminho relativo à pasta raiz do workspace.
 
| Chave | Valor |
| --- | --- |
| *ignoreFile* | *string* |
 
```json
{
  "ignoreFile": "/.vscode/sftp.json"
}
```

### watcher
Configura o comportamento do comando `watcher`.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *watcher* | *object* | `{}` |

#### watcher.files
Padrões glob que são monitorados e, quando editados fora do editor do VSCode, são processados.

| 💡 Importante |
| :--- |
| *Defina* `uploadOnSave` *como* `false` *quando você monitora tudo.*| 

| Chave | Valor |
| --- | --- |
| *watcher.files* | *string* |
 
#### watcher.autoUpload
Faz upload quando o arquivo é alterado.

| Chave | Valor |
| --- | --- |
| *watcher.autoUpload* | *boolean* |

#### watcher.autoDelete
Exclui quando o arquivo é removido.

| Chave | Valor |
| --- | --- |
| *watcher.autoDelete* | *boolean* |
```json
{
  "watcher": {
    "files": "**/*",
    "autoUpload": true,
    "autoDelete": true
  },
}
```

### remoteTimeOffsetInHours
O número de horas de diferença entre a máquina local e o servidor remoto (remoto menos local).

| Chave | Valor | Padrão |
| --- | --- | --- |
| *remoteTimeOffsetInHours* | *number* | `0` |

```json
{
  "remoteTimeOffsetInHours": 3
}
```

### remoteExplorer
Configura o comportamento do comando `remoteExplorer`.

| Chave | Valor | Padrão |
| --- | --- | --- | 
| *remoteExplorer* | *object* | `{}` |
 
#### remoteExplorer.filesExclude
Configura os padrões para excluir arquivos e pastas. <br>
O Remote Explorer decide quais arquivos e pastas mostrar ou ocultar com base nesta configuração..

| Chave | Valor |
| --- | --- |
| *remoteExplorer.filesExclude* | *string[]* |

#### remoteExplorer.order

| Chave | Valor |
| --- | --- |
| *remoteExplorer.order* | *number* |
```json
{
  "remoteExplorer": {
    "filesExclude": [],
    "order": 0
  }
}
```

### concurrency
Reduzir a concorrência pode proporcionar mais estabilidade, pois alguns clientes/servidores têm algum tipo de limite configurado/codificado.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *concurrency* | *number* | `4` |

```json
{
  "concurrency": 3
}
```

### connectTimeout
O tempo máximo de conexão.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *connectTimeout* | *number* | `10000` |

```json
{
  "connectTimeout": 15000
}
```

### limitOpenFilesOnRemote
Limita os descritores de arquivo abertos a um número específico em um servidor remoto. <br>
Defina como true para usar o `limit(222)` padrão.

| 💡 Importante |
| :--- |
| *Não defina isto a menos que seja necessário!* | 

| Chave | Valor | Padrão |
| --- | --- | --- |
| *limitOpenFilesOnRemote* | *mixed* | `false` |

```json
{
  "limitOpenFilesOnRemote": 15000
}
```


## Configuração exclusiva de SFTP

### agent
Caminho para o socket UNIX do ssh-agent para autenticação de usuário baseada em ssh-agent. <br>
Usuários do Windows devem definir como 'pageant' para autenticar com o Pageant ou o caminho (real) para um "UNIX socket" do Cygwin. <br>
Isso proporcionaria mais estabilidade, pois alguns clientes/servidores têm algum tipo de limite configurado/codificado.

| 💡 Detecção automática |
| :--- |
| *Se você não definir **nenhuma** credencial (`password`, `privateKeyPath`, `agent` ou `interactiveAuth`) e a variável de ambiente `SSH_AUTH_SOCK` existir, o ssh-agent dela é usado automaticamente — em vez de pedir uma senha.* |

| Chave | Valor |
| --- | --- |
| *agent* | *string* |

```json
{
  "agent": "/_subfolder_/agent"
}
```

### privateKeyPath
Caminho absoluto para a chave privada do usuário.

| Chave | Valor |
| --- | --- |
| *privateKeyPath* | *string* |

```json
{
  "privateKeyPath": "/.ssh/key.pem"
}
```

### passphrase
Para uma chave privada criptografada, esta é a string de passphrase usada para descriptografá-la. <br>
Defina como 'true' para habilitar o diálogo de passphrase. Isso evitará o uso de passphrase em texto puro nesta configuração. <br>
Com `true`, a passphrase pode ser guardada no cofre do sistema pelo comando **"SFTP: Salvar Senha no Cofre"** (escolha *Passphrase da chave privada*) — assim ela não é pedida a cada conexão. Ela é guardada separadamente da senha da conta.

| Chave | Valor |
| --- | --- |
| *passphrase* | *mixed* |

```json
{
  "passphrase": true
}
```

### hostKeyChecking
Verifica a chave do servidor SSH contra o `known_hosts` antes de conectar — a proteção contra ataques *man-in-the-middle*.

| Valor | Comportamento |
| --- | --- |
| `"prompt"` (padrão) | Em um host **desconhecido**, mostra a impressão digital (fingerprint) e pergunta se você confia. Ao aceitar, a chave é registrada no `known_hosts` e não é perguntado de novo. |
| `"strict"` | Só conecta em hosts **já registrados** no `known_hosts`. Nunca pergunta. |
| `"off"` | Não verifica nada e aceita qualquer chave. **Inseguro** — use apenas em redes confiáveis. |

| ⚠️ Chave alterada |
| :--- |
| *Se o servidor apresentar uma chave **diferente** da registrada, a conexão é sempre recusada — em qualquer modo exceto `"off"`. Isso pode indicar um ataque. Se o servidor foi legitimamente reinstalado, remova a entrada antiga do `known_hosts` e conecte novamente.* |

| Chave | Valor | Padrão |
| --- | --- | --- |
| *hostKeyChecking* | `"strict"`\|`"prompt"`\|`"off"` | `"prompt"` |

```json
{
  "hostKeyChecking": "prompt"
}
```

### knownHosts
Caminho do arquivo `known_hosts` usado pelo [hostKeyChecking](#hostkeychecking). Suporta `~/`.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *knownHosts* | *string* | `~/.ssh/known_hosts` |

```json
{
  "knownHosts": "~/.ssh/known_hosts"
}
```

### interactiveAuth
Habilita o mecanismo de autenticação por interação de teclado. Defina como 'true' para habilitar o diálogo `verifyCode`. <br>
Por exemplo, usando a Autenticação do Google (multifator). Ou passe um array de frases predefinidas para inseri-las automaticamente sem solicitar ao usuário.

| 💡 Nota |
| :--- |
| *Requer que o servidor tenha a autenticação keyboard-interactive habilitada.* | 

| Chave | Valor | Padrão |
| --- | --- | --- |
| *interactiveAuth* | *boolean*\|*string[]* | 'false' |

```json
{
  "interactiveAuth": true
}
```

### algorithms
Substituições explícitas para os algoritmos padrão da camada de transporte usados na conexão.

**Padrão**:
```json
{
  "algorithms": {
    "kex": [
      "ecdh-sha2-nistp256",
      "ecdh-sha2-nistp384",
      "ecdh-sha2-nistp521",
      "diffie-hellman-group-exchange-sha256"
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
      "rsa-sha2-512",
      "rsa-sha2-256"
    ],
    "hmac": [
      "hmac-sha2-256",
      "hmac-sha2-512"
    ]
  },
}
```

### sshConfigPath
Caminho absoluto para o seu arquivo de configuração SSH.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *sshConfigPath* | *string* | `~/.ssh/config` |

```json
{
  "sshConfigPath": "~/.ssh/config"
}
```

### sshCustomParams
Parâmetros extras anexados ao comando SSH usado por "Open SSH in Terminal".

| Chave | Valor |
| --- | --- |
| *sshCustomParams* | *string* |

```json
{
  "sshCustomParams": "-g"
}
```


## Configuração exclusiva de FTP(s)

### secure
Defina como true para criptografia tanto da conexão de controle quanto da de dados. <br>
Defina como `control` para criptografar apenas o controle, ou `implicit` para uma conexão de controle criptografada implicitamente (este modo está obsoleto atualmente, mas geralmente usa a porta 990).

| Chave | Valor | Padrão |
| --- | --- | --- |
| *secure* | *mixed* | `false` |

```json
{
  "secure": control
}
```

### secureOptions
Opções adicionais a serem passadas para `tls.connect()`.

| 💡 Nota |
| :--- |
| *Veja [TLS connect options callback](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).* | 

| Chave | Valor |
| --- | --- |
| *secureOptions* | *object* |

```json
{
  "secureOptions": {
    "enableTrace": true
  }
}
```
