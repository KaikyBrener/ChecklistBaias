/** Erro de regra de negócio: vira resposta HTTP com a mensagem para o usuário. */
export class ErroDominio extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detalhes?: unknown,
  ) {
    super(message);
  }
}
