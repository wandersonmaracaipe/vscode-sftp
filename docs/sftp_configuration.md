## Configuração do SFTP

### agent
Caminho para o socket UNIX do ssh-agent, para autenticação de usuário baseada em ssh-agent. <br>
Usuários do Windows devem definir como 'pageant' para autenticar com o Pageant ou informar o caminho (real) para um "socket UNIX" do Cygwin. <br>
Isso traz mais estabilidade, pois alguns clientes/servidores possuem algum tipo de limite configurado/fixo no código.

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
Defina como 'true' para habilitar o diálogo de passphrase. Isso evita o uso da passphrase em texto puro nesta configuração.

| Chave | Valor |
| --- | --- |
| *passphrase* | *mixed* |

```json
{
  "passphrase": true
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
Caminho absoluto para o seu arquivo de configuração do SSH.

| Chave | Valor | Padrão |
| --- | --- | --- |
| *sshConfigPath* | *string* | `~/.ssh/config` |

```json
{
  "sshConfigPath": "~/.ssh/config"
}
```

### sshCustomParams
Parâmetros extras anexados ao comando SSH usado pelo "Open SSH in Terminal".

| Chave | Valor |
| --- | --- |
| *sshCustomParams* | *string* |

```json
{
  "sshCustomParams": "-g"
}
```
