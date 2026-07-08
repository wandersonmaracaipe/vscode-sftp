## Configuração FTP(s)

### secure
Defina como true para criptografar tanto a conexão de controle quanto a de dados. <br>
Defina como `control` para criptografar apenas a conexão de controle, ou `implicit` para uma conexão de controle criptografada implicitamente (este modo está obsoleto atualmente, mas geralmente usa a porta 990).

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
| *Consulte [TLS connect options callback](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback).* | 

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
