import test from 'node:test';
import assert from 'node:assert/strict';
import { criarAmbiente, montarCentral, type Ambiente, type Cliente } from './helpers.js';

/** Equipamento de uma baia pelo nome (ex.: "Monitor 1"). */
const eq = (detalhe: any, baia: number, nome: string): number =>
  detalhe.baias.find((b: any) => b.numero === baia).equipamentos.find((e: any) => e.nome === nome).id;

async function iniciar(coord: Cliente, centralId: number) {
  const r = await coord.post('/api/checklists', { central_id: centralId });
  return { id: r.corpo.id as number, status: r.status };
}

async function tudoOkTodasAsBaias(coord: Cliente, clId: number, detalhe: any) {
  for (const b of detalhe.baias) await coord.post(`/api/checklists/${clId}/baias/${b.id}/tudo-ok`);
}

test('login: erro genérico, limite de tentativas e logout', async () => {
  const amb = await criarAmbiente();
  try {
    const c = await amb.cliente();
    assert.equal((await c.post('/api/auth/login', { login: 'coord', senha: 'errada' })).status, 401);
    assert.equal((await c.post('/api/auth/login', { login: 'nao-existe', senha: 'qualquer' })).status, 401);
    assert.equal((await c.get('/api/auth/me')).status, 401);
    await c.login('coord');
    assert.equal((await c.get('/api/auth/me')).corpo.usuario.papel, 'COORDENADOR');
    await c.post('/api/auth/logout');
    c.cookie = '';
    assert.equal((await c.get('/api/centrais')).status, 401);
    // 8 falhas seguidas bloqueiam, mesmo com a senha certa
    const x = await amb.cliente();
    for (let i = 0; i < 8; i++) await x.post('/api/auth/login', { login: 'tecnico', senha: 'errada' });
    assert.equal((await x.post('/api/auth/login', { login: 'tecnico', senha: 'senha-forte-123' })).status, 429);
  } finally { await amb.fechar(); }
});

test('escritas exigem o cabeçalho anti-CSRF; cabeçalhos de segurança presentes', async () => {
  const amb = await criarAmbiente();
  try {
    const c = await amb.cliente('admin');
    const r = await fetch(amb.url + '/api/centrais', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.cookie }, body: JSON.stringify({ nome: 'X' }) });
    assert.equal(r.status, 403);
    const g = await fetch(amb.url + '/api/centrais', { headers: { Cookie: c.cookie } });
    assert.match(g.headers.get('content-security-policy') ?? '', /default-src 'self'/);
    assert.equal(g.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(g.headers.get('cache-control'), 'no-store');
  } finally { await amb.fechar(); }
});

test('permissões por perfil', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb);
    const coord = await amb.cliente('coord'), ti = await amb.cliente('tecnico'), ger = await amb.cliente('gerente');
    assert.equal((await coord.post('/api/centrais', { nome: 'Nova' })).status, 403);
    assert.equal((await ti.post('/api/usuarios', { nome: 'X', login: 'xxx', senha: '12345678', papel: 'TI' })).status, 403);
    assert.equal((await ger.post('/api/checklists', { central_id: centralId })).status, 403);
    assert.equal((await ti.post('/api/checklists', { central_id: centralId })).status, 403);
    const cl = await iniciar(coord, centralId);
    assert.equal((await ger.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Monitor 1')}`, { resultado: 'OK' })).status, 403);
    await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Monitor 1')}`, { resultado: 'DEFEITO', severidade: 'DEGRADADO', observacao: 'listras' });
    const oc = (await coord.get('/api/ocorrencias?situacao=abertas')).corpo[0];
    assert.equal((await coord.post(`/api/ocorrencias/${oc.id}/status`, { status: 'EM_MANUTENCAO' })).status, 403);
    assert.equal((await ger.post(`/api/ocorrencias/${oc.id}/status`, { status: 'EM_MANUTENCAO' })).status, 403);
    assert.equal((await ti.post(`/api/ocorrencias/${oc.id}/status`, { status: 'EM_MANUTENCAO' })).status, 200);
    // CSV: gerente e TI podem, coordenador não
    assert.equal((await ger.get('/api/ocorrencias.csv')).status, 200);
    assert.equal((await coord.get('/api/ocorrencias.csv')).status, 403);
  } finally { await amb.fechar(); }
});

test('fluxo do turno: tudo OK, defeito, pendências bloqueiam a conclusão', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb);
    const coord = await amb.cliente('coord');
    const cl = await iniciar(coord, centralId);
    assert.equal(cl.status, 201);
    const sem = await coord.post(`/api/checklists/${cl.id}/concluir`);
    assert.equal(sem.status, 409);
    assert.equal(sem.corpo.detalhes.pendentes.length, 14);

    await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 2, 'Headset')}`, { resultado: 'DEFEITO', severidade: 'INOPERANTE', observacao: 'sem áudio' });
    await tudoOkTodasAsBaias(coord, cl.id, detalhe);
    const det = (await coord.get(`/api/checklists/${cl.id}`)).corpo;
    assert.equal(det.respondidos, 14);
    assert.equal((await coord.post(`/api/checklists/${cl.id}/concluir`)).status, 200);

    const abertas = (await coord.get('/api/ocorrencias?situacao=abertas')).corpo;
    assert.equal(abertas.length, 1);
    assert.equal(abertas[0].equipamento, 'Headset');
    assert.equal(abertas[0].baia, 2);
    assert.equal(abertas[0].turno, 'DIA');
    assert.equal(abertas[0].dia_operacional, '2026-11-04');

    // concluído não aceita mudanças
    const dep = await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Monitor 1')}`, { resultado: 'DEFEITO' });
    assert.equal(dep.status, 409);
  } finally { await amb.fechar(); }
});

test('o defeito persiste entre turnos sem duplicar e é resolvido quando volta a funcionar', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb);
    const coord = await amb.cliente('coord');
    const mon = eq(detalhe, 1, 'Monitor 2');

    const c1 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c1.id}/itens/${mon}`, { resultado: 'DEFEITO', severidade: 'DEGRADADO', observacao: 'tela piscando' });
    await tudoOkTodasAsBaias(coord, c1.id, detalhe);
    await coord.post(`/api/checklists/${c1.id}/concluir`);

    amb.avancarHoras(12); // 20:00 → turno NOITE
    const c2 = await iniciar(coord, centralId);
    assert.notEqual(c2.id, c1.id);
    const antes = (await coord.get(`/api/checklists/${c2.id}`)).corpo;
    const item = antes.baias[0].equipamentos.find((e: any) => e.id === mon);
    assert.equal(item.ocorrenciaAberta.descricao, 'tela piscando'); // já aparece como aberto
    assert.equal(item.resultado, null);

    // "Tudo OK" NÃO pode resolver sozinho o equipamento com defeito aberto
    const t = (await coord.post(`/api/checklists/${c2.id}/baias/${antes.baias[0].id}/tudo-ok`)).corpo;
    assert.equal(t.marcados, 6);
    assert.equal(t.restantes, 1);

    await coord.put(`/api/checklists/${c2.id}/itens/${mon}`, { resultado: 'DEFEITO' }); // persiste
    assert.equal((await coord.get('/api/ocorrencias?situacao=todas')).corpo.length, 1); // nada duplicado
    await coord.post(`/api/checklists/${c2.id}/baias/${antes.baias[1].id}/tudo-ok`);
    assert.equal((await coord.post(`/api/checklists/${c2.id}/concluir`)).status, 200);

    amb.avancarHoras(12); // 08:00 do dia seguinte → DIA
    const c3 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c3.id}/itens/${mon}`, { resultado: 'OK' }); // voltou a funcionar
    const todas = (await coord.get('/api/ocorrencias?situacao=todas')).corpo;
    assert.equal(todas.length, 1);
    assert.equal(todas[0].status, 'RESOLVIDA');

    const d = (await coord.get(`/api/ocorrencias/${todas[0].id}`)).corpo;
    assert.deepEqual(d.eventos.map((e: any) => e.tipo), ['ABERTA', 'CONFIRMADA', 'RESOLVIDA']);
    assert.equal(d.eventos[0].usuario, 'Coord Teste');
  } finally { await amb.fechar(); }
});

test('corrigir uma resposta errada no mesmo checklist não deixa lixo no histórico', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb);
    const coord = await amb.cliente('coord');
    const tec = eq(detalhe, 1, 'Teclado e mouse');
    const cl = await iniciar(coord, centralId);

    await coord.put(`/api/checklists/${cl.id}/itens/${tec}`, { resultado: 'DEFEITO' });
    await coord.put(`/api/checklists/${cl.id}/itens/${tec}`, { resultado: 'OK' }); // errou o toque
    let todas = (await coord.get('/api/ocorrencias?situacao=todas')).corpo;
    assert.equal(todas.length, 1);
    assert.equal(todas[0].status, 'CANCELADA');
    assert.equal((await coord.get('/api/ocorrencias?situacao=abertas')).corpo.length, 0);

    await coord.put(`/api/checklists/${cl.id}/itens/${tec}`, { resultado: 'DEFEITO' }); // era defeito mesmo
    todas = (await coord.get('/api/ocorrencias?situacao=todas')).corpo;
    assert.equal(todas.filter((o: any) => o.status === 'ABERTA').length, 1);

    // repetir a mesma resposta não gera evento novo
    const id = todas.find((o: any) => o.status === 'ABERTA').id;
    const n1 = (await coord.get(`/api/ocorrencias/${id}`)).corpo.eventos.length;
    await coord.put(`/api/checklists/${cl.id}/itens/${tec}`, { resultado: 'DEFEITO' });
    assert.equal((await coord.get(`/api/ocorrencias/${id}`)).corpo.eventos.length, n1);
  } finally { await amb.fechar(); }
});

test('um item "OK" que resolveu a ocorrência volta a abri-la se a resposta for corrigida', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord');
    const mon = eq(detalhe, 1, 'Monitor 1');
    const c1 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c1.id}/itens/${mon}`, { resultado: 'DEFEITO' });
    await tudoOkTodasAsBaias(coord, c1.id, detalhe);
    await coord.post(`/api/checklists/${c1.id}/concluir`);
    amb.avancarHoras(12);
    const c2 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c2.id}/itens/${mon}`, { resultado: 'OK' });
    assert.equal((await coord.get('/api/ocorrencias?situacao=abertas')).corpo.length, 0);
    await coord.put(`/api/checklists/${c2.id}/itens/${mon}`, { resultado: 'DEFEITO' }); // na verdade ainda estava ruim
    const abertas = (await coord.get('/api/ocorrencias?situacao=abertas')).corpo;
    assert.equal(abertas.length, 1);
    assert.equal((await coord.get('/api/ocorrencias?situacao=todas')).corpo.length, 1); // a mesma, reaberta
  } finally { await amb.fechar(); }
});

test('checklist da madrugada pertence ao dia operacional em que a noite começou; repetir retoma o mesmo', async () => {
  const amb = await criarAmbiente('2026-11-05T05:00:00.000Z'); // 02:00 de 05/11
  try {
    const { centralId } = await montarCentral(amb);
    const coord = await amb.cliente('coord');
    const a = await iniciar(coord, centralId);
    const b = await iniciar(coord, centralId);
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(a.id, b.id);
    const d = (await coord.get(`/api/checklists/${a.id}`)).corpo;
    assert.equal(d.turno, 'NOITE');
    assert.equal(d.diaOperacional, '2026-11-04');
  } finally { await amb.fechar(); }
});

test('andamento da ocorrência pela TI: transições válidas, inválidas e cancelamento com motivo', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord'), ti = await amb.cliente('tecnico');
    const cl = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Nobreak')}`, { resultado: 'DEFEITO', severidade: 'INOPERANTE' });
    const id = (await coord.get('/api/ocorrencias?situacao=abertas')).corpo[0].id;
    const muda = (status: string, nota = '') => ti.post(`/api/ocorrencias/${id}/status`, { status, nota });

    assert.equal((await muda('EM_MANUTENCAO', 'técnico a caminho')).status, 200);
    assert.equal((await muda('AGUARDANDO_PECA', 'bateria pedida')).status, 200);
    assert.equal((await muda('CANCELADA')).status, 400); // exige motivo
    assert.equal((await muda('RESOLVIDA', 'bateria trocada')).status, 200);
    assert.equal((await muda('EM_MANUTENCAO')).status, 409); // resolvida só pode reabrir
    assert.equal((await muda('ABERTA', 'voltou a falhar')).status, 200);
    const d = (await ti.get(`/api/ocorrencias/${id}`)).corpo;
    assert.deepEqual(d.eventos.map((e: any) => e.tipo), ['ABERTA', 'STATUS', 'STATUS', 'RESOLVIDA', 'REABERTA']);
    assert.equal(d.resolvida_em, null);
    assert.equal((await ti.post(`/api/ocorrencias/${id}/notas`, { nota: 'peça chega sexta' })).status, 201);
  } finally { await amb.fechar(); }
});

test('só existe uma ocorrência em aberto por equipamento (reabrir a antiga é recusado)', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord'), ti = await amb.cliente('tecnico');
    const tel = eq(detalhe, 1, 'Telefone');
    const cl = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${cl.id}/itens/${tel}`, { resultado: 'DEFEITO' });
    const antiga = (await coord.get('/api/ocorrencias?situacao=abertas')).corpo[0].id;
    await ti.post(`/api/ocorrencias/${antiga}/status`, { status: 'RESOLVIDA' });
    await coord.put(`/api/checklists/${cl.id}/itens/${tel}`, { resultado: 'NA' }); // não desfaz resolução da TI
    // novo defeito no mesmo equipamento, em outro turno
    amb.avancarHoras(12);
    const c2 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c2.id}/itens/${tel}`, { resultado: 'DEFEITO' });
    const r = await ti.post(`/api/ocorrencias/${antiga}/status`, { status: 'ABERTA' });
    assert.equal(r.status, 409);
    assert.match(r.corpo.erro, /outra ocorrência em aberto/);
  } finally { await amb.fechar(); }
});

test('o log de eventos é imutável (acréscimo apenas), até direto no banco', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord');
    const cl = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Monitor 1')}`, { resultado: 'DEFEITO' });
    assert.throws(() => amb.db.prepare("UPDATE ocorrencia_eventos SET nota = 'adulterado'").run(), /somente de acréscimo/);
    assert.throws(() => amb.db.prepare('DELETE FROM ocorrencia_eventos').run(), /somente de acréscimo/);
  } finally { await amb.fechar(); }
});

test('cadastro: não desativa equipamento/baia/central com ocorrência aberta; protege o último admin', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe, admin } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord');
    const mon = eq(detalhe, 1, 'Monitor 1');
    const cl = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${cl.id}/itens/${mon}`, { resultado: 'DEFEITO' });
    assert.equal((await admin.patch(`/api/equipamentos/${mon}`, { ativo: false })).status, 409);
    assert.equal((await admin.patch(`/api/baias/${detalhe.baias[0].id}`, { ativa: false })).status, 409);
    assert.equal((await admin.patch(`/api/centrais/${centralId}`, { ativa: false })).status, 409);
    assert.equal((await admin.patch(`/api/equipamentos/${eq(detalhe, 1, 'Nobreak')}`, { ativo: false })).status, 200);
    const adminId = (await admin.get('/api/usuarios')).corpo.find((u: any) => u.login === 'admin').id;
    assert.equal((await admin.patch(`/api/usuarios/${adminId}`, { ativo: false })).status, 409);
    assert.equal((await admin.patch(`/api/usuarios/${adminId}`, { papel: 'TI' })).status, 409);
    assert.equal((await admin.post('/api/usuarios', { nome: 'Fraco', login: 'fraco', senha: '123', papel: 'TI' })).status, 400);
    // equipamento desativado some do checklist (6 itens em vez de 7)
    const cl2 = (await coord.get(`/api/checklists/${cl.id}`)).corpo;
    assert.equal(cl2.total, 6);
  } finally { await amb.fechar(); }
});

test('painel: números coerentes, mapa de baias e aderência dos checklists', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 2);
    const coord = await amb.cliente('coord');
    // turno 1 (DIA 04/11, começa 07:00): feito às 07:30 → no prazo de 60 min; um defeito parado e outro degradado
    amb.definir('2026-11-04T10:30:00.000Z');
    const c1 = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${c1.id}/itens/${eq(detalhe, 1, 'Computador')}`, { resultado: 'DEFEITO', severidade: 'INOPERANTE' });
    await coord.put(`/api/checklists/${c1.id}/itens/${eq(detalhe, 2, 'Monitor 1')}`, { resultado: 'DEFEITO', severidade: 'DEGRADADO' });
    await tudoOkTodasAsBaias(coord, c1.id, detalhe);
    await coord.post(`/api/checklists/${c1.id}/concluir`);
    // turno 2 (NOITE): ninguém fez → "não feito". Agora são 07:30 do dia seguinte.
    amb.definir('2026-11-05T10:30:00.000Z');

    const p = (await coord.get('/api/painel?dias=7')).corpo;
    assert.equal(p.resumo.abertasAgora, 2);
    assert.equal(p.resumo.inoperantes, 1);
    assert.deepEqual({ ...p.aderencia }, { noPrazo: 1, atrasados: 0, naoFeitos: 1, total: 2, prazoMin: 60 });
    assert.equal(p.resumo.aderenciaPct, 50);
    const baias = p.mapa[0].baias;
    assert.equal(baias.find((b: any) => b.numero === 1).estado, 'INOPERANTE');
    assert.equal(baias.find((b: any) => b.numero === 2).estado, 'ATENCAO');
    assert.equal(p.serieDiaria.length, 7);
    assert.equal(p.serieDiaria.at(-1) !== undefined, true);
    assert.equal(p.porTipo.find((t: any) => t.nome === 'Computador').total, 1);
    assert.equal(p.maisAntigas[0].horas > 20, true);
  } finally { await amb.fechar(); }
});

test('aderência não penaliza turnos anteriores ao primeiro uso, nem central que nunca usou', async () => {
  const amb = await criarAmbiente();
  try {
    await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord');
    amb.definir('2026-11-10T10:30:00.000Z');
    const p = (await coord.get('/api/painel?dias=30')).corpo;
    assert.equal(p.aderencia.total, 0);
    assert.equal(p.resumo.aderenciaPct, null); // sem dados: o painel mostra "—", não 0%
  } finally { await amb.fechar(); }
});

test('checklist feito depois do prazo conta como atrasado', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord');
    amb.avancarHoras(2); // 10:00, 3h depois do início... (início 07:00, prazo 60 min)
    amb.definir('2026-11-04T13:00:00.000Z'); // 10:00 locais
    const c = await iniciar(coord, centralId);
    await tudoOkTodasAsBaias(coord, c.id, detalhe);
    await coord.post(`/api/checklists/${c.id}/concluir`);
    amb.definir('2026-11-05T10:30:00.000Z');
    const p = (await coord.get('/api/painel?dias=7')).corpo;
    assert.equal(p.aderencia.atrasados, 1);
    assert.equal(p.aderencia.noPrazo, 0);
  } finally { await amb.fechar(); }
});

test('CSV: BOM para o Excel, cabeçalho em português e proteção contra fórmula', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId, detalhe } = await montarCentral(amb, 'Central 1', 1);
    const coord = await amb.cliente('coord'), ger = await amb.cliente('gerente');
    const cl = await iniciar(coord, centralId);
    await coord.put(`/api/checklists/${cl.id}/itens/${eq(detalhe, 1, 'Monitor 1')}`, { resultado: 'DEFEITO', observacao: '=HYPERLINK("http://x")' });
    const r = await ger.get('/api/ocorrencias.csv?situacao=todas');
    const csv = r.corpo as string;
    const bruto = new Uint8Array(await (await fetch(amb.url + '/api/ocorrencias.csv', { headers: { Cookie: ger.cookie } })).arrayBuffer());
    assert.deepEqual([...bruto.slice(0, 3)], [0xef, 0xbb, 0xbf]); // BOM UTF-8 (o Excel abre com acento certo)
    assert.match(csv, /ID;Central;Baia;Equipamento;Tipo;Severidade;Status;Aberta em/);
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/); // apóstrofo + aspas escapadas
    assert.match(csv, /04\/11\/2026 08:00/); // horário local de São Paulo, não UTC
    assert.match(r.headers.get('content-disposition') ?? '', /ocorrencias\.csv/);
  } finally { await amb.fechar(); }
});

test('validação: entradas ruins viram 400 com mensagem, nunca 500', async () => {
  const amb = await criarAmbiente();
  try {
    const { centralId } = await montarCentral(amb);
    const coord = await amb.cliente('coord'), admin = await amb.cliente('admin');
    assert.equal((await coord.post('/api/checklists', { central_id: 'abc' })).status, 400);
    assert.equal((await coord.post('/api/checklists', { central_id: 9999 })).status, 404);
    assert.equal((await coord.put('/api/checklists/1/itens/1', { resultado: 'TALVEZ' })).status, 400);
    assert.equal((await coord.get('/api/ocorrencias/abc')).status, 400);
    assert.equal((await coord.get('/api/ocorrencias/9999')).status, 404);
    assert.equal((await coord.get('/api/painel?dias=0')).status, 400);
    assert.equal((await admin.post(`/api/centrais/${centralId}/baias`, { de: 5, ate: 1 })).status, 400);
    assert.equal((await admin.post('/api/centrais', { nome: 'Central 1' })).status, 409);
    const lixo = await fetch(amb.url + '/api/centrais', { method: 'POST', headers: { 'X-Requested-With': 'checklist-baias', 'Content-Type': 'application/json', Cookie: admin.cookie }, body: '{quebrado' });
    assert.equal(lixo.status, 400);
  } finally { await amb.fechar(); }
});

test('equipamento de outra central não entra no checklist', async () => {
  const amb = await criarAmbiente();
  try {
    const a = await montarCentral(amb, 'Central 1', 1);
    const b = await montarCentral(amb, 'Central 2', 1);
    const coord = await amb.cliente('coord');
    const cl = await iniciar(coord, a.centralId);
    const r = await coord.put(`/api/checklists/${cl.id}/itens/${eq(b.detalhe, 1, 'Monitor 1')}`, { resultado: 'OK' });
    assert.equal(r.status, 400);
  } finally { await amb.fechar(); }
});
