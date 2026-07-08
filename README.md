# Valuor SFTP — sincronização SFTP/FTP para o VS Code

Mantido pela **Valuor**. <br>
Fork do [vscode-sftp do @Natizyskunk](https://github.com/Natizyskunk/vscode-sftp), que por sua vez é um fork do [plugin SFTP original do liximomo](https://github.com/liximomo/vscode-sftp.git) (não mais mantido). Todo o crédito aos autores originais.

- Marketplace do VS Code: https://marketplace.visualstudio.com/items?itemName=Valuor.valuor-sftp <br>
- Código-fonte e releases: https://github.com/wandersonmaracaipe/vscode-sftp

✳ Contribuições são bem-vindas — abra uma _issue_ ou um _pull request_ no [repositório](https://github.com/wandersonmaracaipe/vscode-sftp).

## Sobre este fork
Esta é uma versão modernizada da extensão SFTP: o _toolchain_ foi atualizado (TypeScript 5, ESLint, `@types` atualizados), as dependências foram atualizadas e **todas as vulnerabilidades conhecidas do `npm audit` foram resolvidas**, além de alguns bugs de _build_/execução corrigidos. O conjunto de recursos e a configuração permanecem compatíveis com a extensão de origem.

**Novidades desta versão (1.17.0):**
- Biblioteca FTP abandonada (`ftp`) substituída pela moderna `basic-ftp`.
- Correção do travamento "isDate is not a function" em versões recentes do VS Code (atualização do `ssh2`).
- Correções de bugs do projeto de origem: "Config Not Found" ao salvar/enviar (#428), sobrescrita silenciosa ao criar arquivo (#228) e _symlinks_ para diretórios agora navegáveis (#177).
- **Confirmação modal antes de excluir** itens remotos.
- Comando **"SFTP: Toggle Upload On Save"** para pausar/retomar o envio automático ao salvar.
- **Indicador de conexão** na barra de status.
- **Barra de progresso cancelável** em transferências com vários arquivos.

---

O Valuor SFTP permite adicionar, editar ou excluir arquivos em um diretório local e sincronizá-los com um diretório de servidor remoto usando diferentes protocolos de transferência, como FTP ou SSH. A configuração mais básica exige apenas algumas linhas, e há uma ampla gama de opções específicas para atender às necessidades de qualquer usuário. Poderoso e rápido, ele ajuda desenvolvedores a economizar tempo permitindo o uso de um editor e ambiente familiares.

- Recursos
  - [Navegar no remoto com o Remote Explorer](#remote-explorer)
  - _Diff_ entre local e remoto
  - Sincronizar diretórios
  - Enviar/Baixar (Upload/Download)
  - Enviar ao salvar (_upload on save_)
  - _File Watcher_
  - Múltiplas configurações
  - Perfis alternáveis
  - Suporte a arquivo temporário
  - Confirmação modal antes de excluir no remoto
  - Barra de progresso cancelável em transferências
  - Indicador de conexão na barra de status
- [Comandos](docs/commands.md)
- [Depuração](#depuração)
- [FAQ](#faq)

## Instalação

### Método 1 (Recomendado: atualização automática)
1. Abra as Extensões (Ctrl + Shift + X).
2. Desinstale qualquer outra extensão sftp que você tenha instalado.
3. Instale esta extensão diretamente pelo Marketplace do VS Code: https://marketplace.visualstudio.com/items?itemName=Valuor.valuor-sftp.
4. Pronto!

### Método 2 (Instalação manual via VSIX)
Para instalar, siga estes passos dentro do VS Code:
1. Abra as Extensões (Ctrl + Shift + X).
2. Desinstale qualquer outra extensão sftp que você tenha instalado.
3. Abra o menu "Mais Ações" (as reticências no topo) e clique em "Instalar do VSIX…".
4. Localize o arquivo `.vsix` e selecione.
5. Recarregue o VS Code.
6. Pronto!

## Documentação
- [Início](docs/home.md)
- [Configurações (Settings)](docs/setting.md)
- [Configuração comum](docs/common_configuration.md)
- [Configuração SFTP](docs/sftp_configuration.md)
- [Configuração FTP](docs/ftp_configuration.md)
- [Comandos](docs/commands.md)

## Uso
Se os arquivos mais recentes já estão no servidor remoto, você pode começar com uma pasta local vazia, baixar seu projeto e, a partir daí, sincronizar.

1. No `VS Code`, abra o diretório local que deseja sincronizar com o servidor remoto (ou crie um diretório vazio no qual deseja primeiro baixar o conteúdo de uma pasta remota para editar localmente).
2. `Ctrl+Shift+P` no Windows/Linux ou `Cmd+Shift+P` no Mac para abrir a paleta de comandos e execute o comando `SFTP: Config`.
3. Um arquivo de configuração básico chamado `sftp.json` aparecerá na pasta `.vscode`. Abra-o e edite os parâmetros com as informações do seu servidor remoto.

Por exemplo:
```json
{
    "name": "Nome do Perfil",
    "host": "endereco_do_host_remoto",
    "protocol": "ftp",
    "port": 21,
    "secure": true,
    "username": "usuario",
    "remotePath": "/public_html/projeto", // <--- Este é o caminho que será baixado ao usar "Download Project"
    "password": "senha",
    "uploadOnSave": false
}
```
O parâmetro `password` no `sftp.json` é opcional; se omitido, a senha será solicitada na sincronização.
_Observação:_ barras invertidas e outros caracteres especiais devem ser escapados com uma barra invertida.

4. Salve e feche o arquivo `sftp.json`.
5. `Ctrl+Shift+P` no Windows/Linux ou `Cmd+Shift+P` no Mac para abrir a paleta de comandos.
6. Digite `sftp` e você verá diversos outros comandos. Muitos deles também estão disponíveis nos menus de contexto do explorador de arquivos do projeto.
7. Um bom começo, se você quer sincronizar com uma pasta remota, é `SFTP: Download Project`. Isso baixa o diretório indicado em `remotePath` no `sftp.json` para o diretório local aberto.
8. Pronto — agora você pode editar localmente e, a cada salvamento, o arquivo remoto será sincronizado com a cópia local.
9. Aproveite!

Para explicações detalhadas, consulte a [documentação](docs/home.md).

## Configurações de exemplo
Você pode ver a lista completa de opções de configuração [aqui](docs/configuration.md).

- [Valuor SFTP](#valuor-sftp--sincronização-sftpftp-para-o-vs-code)
  - [Sobre este fork](#sobre-este-fork)
  - [Instalação](#instalação)
  - [Documentação](#documentação)
  - [Uso](#uso)
  - [Configurações de exemplo](#configurações-de-exemplo)
    - [Simples](#simples)
    - [Perfis](#perfis)
    - [Múltiplos contextos](#múltiplos-contextos)
    - [Conexão via salto (hopping)](#conexão-via-salto-hopping)
      - [Salto único](#salto-único)
      - [Múltiplos saltos](#múltiplos-saltos)
    - [Configuração nas User Settings](#configuração-nas-user-settings)
  - [Remote Explorer](#remote-explorer)
    - [Seleção múltipla](#seleção-múltipla)
    - [Ordenação](#ordenação)
  - [Depuração](#depuração)
  - [FAQ](#faq)
  - [Créditos](#créditos)

### Simples
```json
{
  "host": "host",
  "username": "usuario",
  "remotePath": "/remoto/workspace"
}
```

### Perfis
```json
{
  "username": "usuario",
  "password": "senha",
  "remotePath": "/remoto/workspace/a",
  "watcher": {
    "files": "dist/*.{js,css}",
    "autoUpload": false,
    "autoDelete": false
  },
  "profiles": {
    "dev": {
      "host": "dev-host",
      "remotePath": "/dev",
      "uploadOnSave": true
    },
    "prod": {
      "host": "prod-host",
      "remotePath": "/prod"
    }
  },
  "defaultProfile": "dev"
}
```

_Observação:_ `context` e `watcher` só estão disponíveis no nível raiz.

Use `SFTP: Set Profile` para alternar de perfil.

### Múltiplos contextos
Os contextos **não podem ser iguais**.
```json
[
  {
    "name": "servidor1",
    "context": "projeto/build",
    "host": "host",
    "username": "usuario",
    "password": "senha",
    "remotePath": "/remoto/projeto/build"
  },
  {
    "name": "servidor2",
    "context": "projeto/src",
    "host": "host",
    "username": "usuario",
    "password": "senha",
    "remotePath": "/remoto/projeto/src"
  }
]
```

_Observação:_ `name` é obrigatório neste modo.

### Conexão via salto (hopping)
Você pode se conectar a um servidor de destino através de um proxy usando o protocolo ssh.

_Observação:_ a substituição de variáveis não funciona em uma configuração de salto.

#### Salto único
local -> salto -> destino
```json
{
  "name": "destino",
  "remotePath": "/caminho/no/destino",

  // salto
  "host": "hostDoSalto",
  "username": "usuarioDoSalto",
  "privateKeyPath": "/Users/usuarioLocal/.ssh/id_rsa", // <-- A chave é assumida como estando na máquina local.

  "hop": {
    // destino
    "host": "hostDestino",
    "username": "usuarioDestino",
    "privateKeyPath": "/Users/usuarioSalto/.ssh/id_rsa", // <-- A chave é assumida como estando no salto.
  }
}
```

#### Múltiplos saltos
local -> saltoA -> saltoB -> destino
```json
{
  "name": "destino",
  "remotePath": "/caminho/no/destino",

  // saltoA
  "host": "hostSaltoA",
  "username": "usuarioSaltoA",
  "privateKeyPath": "/Users/usuarioSaltoA/.ssh/id_rsa" // <-- A chave é assumida como estando na máquina local.

  "hop": [
    // saltoB
    {
      "host": "hostSaltoB",
      "username": "usuarioSaltoB",
      "privateKeyPath": "/Users/usuarioSaltoA/.ssh/id_rsa" // <-- A chave é assumida como estando no saltoA.
    },

    // destino
    {
      "host": "hostDestino",
      "username": "usuarioDestino",
      "privateKeyPath": "/Users/usuarioSaltoB/.ssh/id_rsa", // <-- A chave é assumida como estando no saltoB.
    }
  ]
}
```

### Configuração nas User Settings
Você pode usar `remote` para dizer ao sftp para obter a configuração do [remote-fs](https://github.com/liximomo/vscode-remote-fs).

Nas User Settings:
```json
"remotefs.remote": {
  "dev": {
    "scheme": "sftp",
    "host": "host",
    "username": "usuario",
    "rootPath": "/caminho/para/algum/lugar"
  },
  "projectX": {
    "scheme": "sftp",
    "host": "host",
    "username": "usuario",
    "privateKeyPath": "/Users/xx/.ssh/id_rsa",
    "rootPath": "/home/foo/algum/projectx"
  }
}
```

No sftp.json:
```json
{
  "remote": "dev",
  "remotePath": "/home/xx/",
  "uploadOnSave": false,
  "ignore": [".vscode", ".git", ".DS_Store"]
}
```

## Remote Explorer
![previa-do-remote-explorer](assets/showcase/remote-explorer.png)

O Remote Explorer permite explorar os arquivos no remoto. Você pode abri-lo de duas formas:

1. Execute o comando `View: Show SFTP`.
2. Clique na visão SFTP na Barra de Atividades.

Pelo Remote Explorer você só visualiza o conteúdo de um arquivo. Execute o comando `SFTP: Edit in Local` para editá-lo localmente.

### Seleção múltipla
Você pode selecionar vários arquivos/pastas de uma vez no servidor remoto para baixar e enviar. Basta segurar Ctrl ou Shift enquanto seleciona os itens desejados, como no explorador de arquivos comum.

_Observação:_ pode ser necessário atualizar manualmente a pasta pai depois de **excluir** um arquivo, caso o explorador não seja atualizado corretamente.

### Ordenação
Você pode ordenar o Remote Explorer adicionando o parâmetro `remoteExplorer.order` no seu arquivo `sftp.json`.

No sftp.json:
```json
{
  "remoteExplorer": {
    "order": 1 // <-- O valor padrão é 0.
  }
}
```

## Depuração
1. Abra as User Settings.
  - No Windows/Linux — `File > Preferences > Settings`
  - No macOS — `Code > Preferences > Settings`
2. Defina `sftp.debug` como `true` e recarregue o VS Code.
3. Veja os logs em `View > Output > sftp`.

## FAQ
Você pode ver todas as Perguntas Frequentes [aqui](./FAQ.md).

## Créditos
Esta extensão se apoia no trabalho de [liximomo](https://github.com/liximomo/vscode-sftp) (autor original) e [Natizyskunk](https://github.com/Natizyskunk/vscode-sftp) (mantenedor de longa data do fork em que esta se baseia). Obrigado pelo trabalho de vocês.
