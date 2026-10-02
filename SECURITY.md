# Security policy

JanjaLive é um projeto público, mas dados de salas e credenciais continuam privados. Não abra issue pública contendo convites, cookies, credenciais OAuth, SDP, candidatos ICE, endereços de rede, URLs de banco, tokens Redis/TURN ou capturas de salas privadas.

Reporte vulnerabilidades privadamente ao proprietário através de GitHub Security Advisories. Inclua commit afetado, passos com dados redigidos, impacto e mitigação quando possível.

Versões anteriores ao primeiro release `v0.1.0` devem ser tratadas como desenvolvimento. Após o release, correções de segurança serão concentradas na versão mais recente publicada.

O projeto não promete anonimato entre peers. WebRTC pode revelar informação de rede durante ICE. A mídia é criptografada em trânsito, mas uma pessoa autorizada a assistir ainda pode capturá-la fora do JanjaLive.
