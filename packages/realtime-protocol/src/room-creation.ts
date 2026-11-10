export const ROOM_CREATION_LIMITS = { activeRoomsPerOwner: 5, roomCreationsPerDay: 20 } as const;

const messages = {
  ACTIVE_ROOM_LIMIT_REACHED: `Você já tem ${ROOM_CREATION_LIMITS.activeRoomsPerOwner} salas ativas. Exclua uma delas para criar outra.`,
  DAILY_ROOM_LIMIT_REACHED: `Você atingiu o limite de ${ROOM_CREATION_LIMITS.roomCreationsPerDay} criações em 24 horas. Aguarde esse período terminar para criar outra sala. Excluir salas não libera esse limite.`,
  ROOM_LIMIT_REACHED: "Limite de criação de salas atingido. Exclua uma sala ativa ou tente novamente mais tarde.",
  ROOM_CREATION_PAUSED: "A criação de salas está temporariamente indisponível. Tente novamente mais tarde.",
} as const;

export function isRoomCreationErrorCode(value: unknown): value is keyof typeof messages {
  return typeof value === "string" && Object.hasOwn(messages, value);
}

export function roomCreationErrorMessage(error: unknown): string {
  // Electron adds an IPC prefix to Error.message. Match only a known final code.
  const code = error instanceof Error ? error.message.split(/:\s*/).at(-1) : error;
  return isRoomCreationErrorCode(code) ? messages[code] : "Não foi possível criar a sala. Tente novamente.";
}
