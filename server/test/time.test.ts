import test from 'node:test';
import assert from 'node:assert/strict';
import { fimDoTurno, inicioDoTurno, localParaUtc, proximoTurno, turnoConfigPadrao as cfg, turnoDe, turnosEncerradosEntre, validarConfig } from '../src/time.js';

// São Paulo = UTC-3 (sem horário de verão desde 2019)
test('turno DIA: 07:00 até 18:59', () => {
  assert.equal(turnoDe(new Date('2026-11-04T10:00:00Z'), cfg).turno, 'DIA'); // 07:00
  const t = turnoDe(new Date('2026-11-04T21:59:00Z'), cfg); // 18:59
  assert.equal(t.turno, 'DIA');
  assert.equal(t.diaOperacional, '2026-11-04');
});

test('turno NOITE começa às 19:00 e vale o mesmo dia operacional', () => {
  const t = turnoDe(new Date('2026-11-04T22:00:00Z'), cfg); // 19:00
  assert.equal(t.turno, 'NOITE');
  assert.equal(t.diaOperacional, '2026-11-04');
});

test('madrugada pertence à NOITE do dia operacional anterior', () => {
  const t = turnoDe(new Date('2026-11-05T05:00:00Z'), cfg); // 02:00 de 05/11
  assert.equal(t.turno, 'NOITE');
  assert.equal(t.diaOperacional, '2026-11-04');
  const limite = turnoDe(new Date('2026-11-05T09:59:00Z'), cfg); // 06:59
  assert.equal(limite.diaOperacional, '2026-11-04');
  assert.equal(turnoDe(new Date('2026-11-05T10:00:00Z'), cfg).turno, 'DIA'); // 07:00
});

test('a noite atravessa a meia-noite: início 19:00 e fim 07:00 do dia seguinte', () => {
  assert.equal(inicioDoTurno('2026-11-04', 'NOITE', cfg).toISOString(), '2026-11-04T22:00:00.000Z');
  assert.equal(fimDoTurno('2026-11-04', 'NOITE', cfg).toISOString(), '2026-11-05T10:00:00.000Z');
  assert.equal(fimDoTurno('2026-11-04', 'DIA', cfg).toISOString(), '2026-11-04T22:00:00.000Z');
});

test('virada de mês e de ano', () => {
  const t = turnoDe(new Date('2027-01-01T04:00:00Z'), cfg); // 01:00 de 01/01
  assert.equal(t.diaOperacional, '2026-12-31');
  assert.equal(proximoTurno(turnoDe(new Date('2026-12-31T23:00:00Z'), cfg), cfg).diaOperacional, '2027-01-01');
});

test('localParaUtc converte no fuso configurado', () => {
  assert.equal(localParaUtc('2026-11-04', 7, 0, 'America/Sao_Paulo').toISOString(), '2026-11-04T10:00:00.000Z');
  assert.equal(localParaUtc('2026-07-01', 12, 30, 'UTC').toISOString(), '2026-07-01T12:30:00.000Z');
});

test('turnosEncerradosEntre lista só turnos completos', () => {
  const de = new Date('2026-11-01T10:00:00Z'); // 07:00 de 01/11
  const ate = new Date('2026-11-03T10:00:00Z'); // 07:00 de 03/11
  const l = turnosEncerradosEntre(de, ate, cfg);
  assert.equal(l.length, 4); // D1 N1 D2 N2
  assert.deepEqual(l.map((t) => `${t.diaOperacional}/${t.turno}`), ['2026-11-01/DIA', '2026-11-01/NOITE', '2026-11-02/DIA', '2026-11-02/NOITE']);
});

test('configuração inválida é recusada', () => {
  assert.throws(() => validarConfig({ ...cfg, diaInicioHora: 19, noiteInicioHora: 7 }));
  assert.throws(() => validarConfig({ ...cfg, tz: 'Marte/Olimpo' }));
  assert.doesNotThrow(() => validarConfig(cfg));
});
