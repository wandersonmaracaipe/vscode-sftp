## Comandos comuns

### SFTP: Config
Cria um novo arquivo de configuração para um projeto.

### SFTP: Set Profile
Define o perfil atual.
           
#### Argumentos de KeyBindings
func(profileName: string)

### SFTP: Upload Active File
Envia o arquivo atual.

### SFTP: Upload Changed Files
Envia todos os arquivos alterados ou criados desde o último commit no seu Git.
Pode ser chamado pelo atalho de teclado padrão `Ctrl+Alt+U`.

### SFTP: Upload Active Folder
Envia a pasta inteira em que o arquivo atual está localizado.

### SFTP: Download Active File
Baixa a versão remota do arquivo atual e sobrescreve a cópia local.

### SFTP: Download Active Folder
Baixa a pasta inteira em que o arquivo atual está localizado.

### SFTP: Sync Local -> Remote
1. Qualquer arquivo que exista tanto no local quanto no remoto e que tenha um timestamp diferente entre local e remoto é copiado.
2. Qualquer arquivo que exista apenas no local é copiado.

Você pode alterar o comportamento padrão com [syncOption](configuration.md#syncoption).

### SFTP: Sync Remote -> Local
Igual a `Sync Local -> Remote`, mas na direção oposta.

### SFTP: Sync Both Directions
Compara os horários de modificação dos arquivos e sempre executa a ação que faz com que o arquivo mais recente esteja presente em ambos os locais.

*Apenas [skipCreate](configuration.md#syncoptionskipcreate) e [ignoreExisting](configuration.md#syncoptionignoreexisting) são válidos para este comando.*

### SFTP: List Active Folder
Lista a pasta em que o arquivo atual está localizado.

### sftp.upload
Envia arquivo ou pastas.

#### Argumentos de KeyBindings
func(fspaths: string[])

### sftp.download
Baixa arquivo ou pastas.

#### Argumentos de KeyBindings
func(fspaths: string[])

### SFTP: Cancel All Transfers
Interrompe as transferências atuais (upload e download).

### SFTP: Reconectar (reiniciar conexões)
Descarta todas as conexões abertas e as transferências pendentes, e zera os indicadores da barra de status. A próxima operação conecta do zero.

Use quando a extensão parecer travada — por exemplo, um envio que não termina ou um erro que parece se repetir sem sair do lugar. Substitui o recurso de "fechar e reabrir o editor": nenhuma configuração é perdida e o trabalho local não é tocado.

### SFTP: Open SSH in Terminal
Abre um terminal no VSCode e faz login automático em um servidor específico.


## Comandos Alt
Um comando alternativo pode ser encontrado ao pressionar `Alt` enquanto abre um menu.

### Force Download
Baixa o arquivo, mas desconsidera as regras de ignore.

### Force Upload
Envia o arquivo, mas desconsidera as regras de ignore.
