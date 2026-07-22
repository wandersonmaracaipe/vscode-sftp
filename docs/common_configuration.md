## Configuração comum

### name
Uma string para identificar sua configuração.

| Key | Value |
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

| Key | Value | Default |
| --- | --- | --- |
| *context* | *string* | *A raiz do workspace.* |

```json
{
  "context": "/_subfolder_"
}
```

### protocol
Protocolo a ser usado.

| Key | Value | Default |
| --- | --- | --- |
| *protocol* | `sftp` *ou* `ftp` | `sftp` |

```json
{
  "protocol": "sftp"
}
```

### host
Nome do host ou endereço IP do servidor.

| Key | Value |
| --- | --- |
| *host* | *string* |

```json
{
  "host": "server.example.com"
}
```

### port
Número da porta do servidor.

| Key | Value |
| --- | --- |
| *port* | *integer* |

```json
{
  "port": 22
}
```

### username
Nome de usuário para autenticação.

| Key | Value |
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

| Key | Value |
| --- | --- |
| *password* | *string* |

```json
{
  "password": "Password123"
}
```

### remotePath
O caminho absoluto no host remoto.

| Key | Value | Default |
| --- | --- | --- |
| *remotePath* | *string* | `/` |

```json
{
  "remotePath": "/_subfolder_"
}
```

### filePerm
Define permissões octais de arquivo para novos arquivos.

| Key | Value | Default |
| --- | --- | --- |
| *filePerm* | *number* | `false` |

```json
{
  "filePerm": 644
}
```
 
### dirPerm
Define permissões octais de diretório para novos diretórios.

| Key | Value | Default |
| --- | --- | --- |
| *dirPerm* | *number* | `false` |

```json
{
  "dirPerm": 750
}
```

### uploadOnSave
Faz upload a cada operação de salvamento do VSCode.

| Key | Value | Default |
| --- | --- | --- |
| *uploadOnSave* | *boolean* | `false` |

```json
{
  "uploadOnSave": true
}
```

### useTempFile
Faz upload de um arquivo temporário a cada operação de salvamento do VSCode para evitar quebrar uma página web quando um usuário a acessa enquanto o arquivo ainda está sendo enviado (está incompleto).

| Key | Value | Default |
| --- | --- | --- |
| *useTempFile* | *boolean* | `false` |

```json
{
  "useTempFile": true
}
```

### openSsh
Habilita uploads atômicos de arquivo (*suportado apenas por servidores openSSH*).

| 💡 Importante |
| :--- |
| *Se definido como* `true`*, a opção* `useTempFile` *também deve ser definida como* `true`.|

| Key | Value | Default |
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

| Key | Value | Default |
| --- | --- | --- |
| *downloadOnOpen* | *boolean* | `false` |

```json
{
  "downloadOnOpen": true
}
```

### syncOption
Configura o comportamento do comando `Sync`.

| Key | Value | Default |
| --- | --- | --- |
| *syncOption* | *object* | `{}` |

#### syncOption.delete
Exclui arquivos supérfluos dos diretórios de destino.

| Key | Value |
| --- | --- |
| *syncOption.delete* | *boolean* |

#### syncOption.skipCreate
Ignora a criação de novos arquivos no destino.

| Key | Value |
| --- | --- |
| *syncOption.skipCreate* | *boolean* |

#### syncOption.ignoreExisting
Ignora a atualização de arquivos que existem no destino.

| Key | Value |
| --- | --- |
| *syncOption.ignoreExisting* | *boolean* |

#### syncOption.update
Atualiza o destino apenas se houver uma versão mais recente no sistema de arquivos de origem.

| Key | Value |
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

### ignore
Ignore pode ser usado para ignorar arquivos e pastas na sincronização, e até suporta curingas usando `*`. <br>
Este é o mesmo comportamento do gitignore, todos os caminhos relativos ao context da configuração atual. <br>
Quando você **não** define `ignore`, um padrão sensato é aplicado para evitar sincronizar pastas pesadas/transitórias por acidente. Definir a sua própria lista **substitui** o padrão (não é mesclado).

| Key | Value | Default |
| --- | --- | --- |
| *ignore* | *string[]* | `['.vscode', '.git', '.DS_Store', 'node_modules', '*.tmp.*', '*.vsctmp', '*.swp', '*~']` |
 
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
 
| Key | Value |
| --- | --- |
| *ignoreFile* | *string* |
 
```json
{
  "ignoreFile": "/.vscode/sftp.json"
}
```

### watcher
Configura o comportamento do comando `watcher`.

| Key | Value | Default |
| --- | --- | --- |
| *watcher* | *object* | `{}` |

#### watcher.files
Padrões glob que são monitorados e, quando editados fora do editor VSCode, são processados.

| 💡 Importante |
| :--- |
| *Defina* `uploadOnSave` *como* `false` *quando você monitora tudo.*| 

| Key | Value |
| --- | --- |
| *watcher.files* | *string* |
 
#### watcher.autoUpload
Faz upload quando o arquivo é alterado.

| Key | Value |
| --- | --- |
| *watcher.autoUpload* | *boolean* |

#### watcher.autoDelete
Exclui quando o arquivo é removido.

| Key | Value |
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

| Key | Value | Default |
| --- | --- | --- |
| *remoteTimeOffsetInHours* | *number* | `0` |

```json
{
  "remoteTimeOffsetInHours": 3
}
```

### remoteExplorer
Configura o comportamento do comando `remoteExplorer`.

| Key | Value | Default |
| --- | --- | --- | 
| *remoteExplorer* | *object* | `{}` |
 
#### remoteExplorer.filesExclude
Configura os padrões para excluir arquivos e pastas. <br>
O Remote Explorer decide quais arquivos e pastas mostrar ou ocultar com base nesta configuração..

| Key | Value |
| --- | --- |
| *remoteExplorer.filesExclude* | *string[]* |

#### remoteExplorer.order

| Key | Value |
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
Reduzir a concorrência pode trazer mais estabilidade porque alguns clientes/servidores têm algum tipo de limite configurado/codificado.

| Key | Value | Default |
| --- | --- | --- |
| *concurrency* | *number* | `4` |

```json
{
  "concurrency": 3
}
```

### connectTimeout
O tempo máximo de conexão.

| Key | Value | Default |
| --- | --- | --- |
| *connectTimeout* | *number* | `10000` |

```json
{
  "connectTimeout": 15000
}
```

### limitOpenFilesOnRemote
Limita os descritores de arquivo abertos ao número específico em um servidor remoto. <br>
Defina como true para usar o `limit(222)` padrão.

| 💡 Importante |
| :--- |
| *Não defina isto a menos que seja necessário!* | 

| Key | Value | Default |
| --- | --- | --- |
| *limitOpenFilesOnRemote* | *mixed* | `false` |

```json
{
  "limitOpenFilesOnRemote": 15000
}
```
