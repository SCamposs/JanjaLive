// Global, server-install-only commands. No DMs or user-install context.
export const commands = [
  { name: 'janja', type: 1, description: 'Abra a sala da sua call no JanjaLive.', integration_types: [0], contexts: [0] },
  { name: 'janja-limpar', type: 1, description: 'Apague apenas mensagens recentes do JanjaLive neste canal, preservando as salas.',
    default_member_permissions: '8192', integration_types: [0], contexts: [0] },
];
