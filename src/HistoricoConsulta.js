/**
 * HistoricoConsulta.js – tela "Histórico" (todas as competências, filtro por vigência)
 * e exportação CSV. Somente leitura; nenhum valor em reais.
 */

/** Competências de uma vigência (padrão: VIGENCIA_ATUAL) e a lista de vigências para o filtro. */
function getHistorico(vigenciaId) {
  requirePerfil_(TODOS_PERFIS);
  const dados = dadosHistorico_(vigenciaId);
  return {
    vigencias: dados.vigencias,
    vigencia: dados.vigencia,
    itens: dados.itens,
    competencias: dados.competencias.map(function (c) {
      return {
        competencia: c.competencia,
        status: c.status,
        statusRotulo: c.statusRotulo,
        medicoes: c.medicoes,
        ansUptimePct: c.ansUptimePct,
        ansMinutos: c.ansMinutos,
        ansCumprido: c.ansCumprido,
        idsPreenchidos: c.idsPreenchidos,
        dataEnvio: c.dataEnvio
      };
    })
  };
}

/**
 * CSV da vigência para o Excel em português: separador ";", vírgula decimal,
 * datas dd/mm/aaaa e BOM UTF-8 para os acentos.
 */
function exportarHistoricoCsv(vigenciaId) {
  requirePerfil_(TODOS_PERFIS);
  const dados = dadosHistorico_(vigenciaId);

  const cabecalho = ['Competência', 'Vigência', 'Status'];
  dados.itens.forEach(function (it) {
    if (it.tipo === 'CONSUMO') {
      cabecalho.push('Item ' + it.item + ' – relatório', 'Item ' + it.item + ' – medida', 'Item ' + it.item + ' – ajuste');
    } else {
      cabecalho.push('Item ' + it.item + ' – medida');
    }
  });
  cabecalho.push('ANS – uptime (%)', 'ANS – minutos', 'ANS – cumprido', 'ANS – observação');
  CAMPOS_IDS_SEI.forEach(function (f) { cabecalho.push('ID do ' + f.rotulo); });
  cabecalho.push('Data de envio para pagamento', 'Pasta do Drive');

  const linhas = dados.competencias.slice().reverse().map(function (c) {
    const linha = [rotuloCompetencia_(c.competencia), dados.vigencia, c.statusRotulo];
    dados.itens.forEach(function (it) {
      const m = c.medicoes[it.item] || {};
      if (it.tipo === 'CONSUMO') linha.push(m.quantidadeRelatorio, m.quantidade, m.ajusteObs);
      else linha.push(m.quantidade);
    });
    linha.push(
      c.ansUptimePct === null ? '' : String(c.ansUptimePct).replace('.', ','),
      c.ansMinutos,
      c.ansCumprido === null ? '' : (c.ansCumprido ? 'Sim' : 'Não'),
      c.ansObs
    );
    CAMPOS_IDS_SEI.forEach(function (f) { linha.push(c.ids[f.campo]); });
    linha.push(c.dataEnvio ? dataBr_(c.dataEnvio) : '', c.pastaDrive);
    return linha;
  });

  const conteudo = '﻿' + [cabecalho].concat(linhas).map(function (l) {
    return l.map(celulaCsv_).join(';');
  }).join('\r\n');
  const hoje = Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd');
  return {
    nomeArquivo: 'fiscalizacao_contrato_' + String(lerConfig_().CONTRATO || '').replace('/', '-') +
      '_' + dados.vigencia + '_' + hoje + '.csv',
    conteudo: conteudo,
    linhas: linhas.length
  };
}

/* ---------- Leitura comum ---------- */

function dadosHistorico_(vigenciaId) {
  const config = lerConfig_();
  const vigencias = listar_(ABAS.VIGENCIAS)
    .map(function (v) {
      const id = String(v.id).trim();
      return { id: id, rotulo: id + ' · ' + dataBr_(dataIso_(v.inicio)) + ' a ' + dataBr_(dataIso_(v.fim)), inicio: dataIso_(v.inicio) };
    })
    .sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
  const pedida = String(vigenciaId || config.VIGENCIA_ATUAL || '').trim();
  if (!vigencias.some(function (v) { return v.id === pedida; })) {
    throw new Error('Vigência "' + pedida + '" não encontrada na aba Vigencias.');
  }

  const medicoesPorComp = {};
  listar_(ABAS.MEDICOES).forEach(function (m) {
    const comp = textoCompetencia_(m.competencia);
    medicoesPorComp[comp] = medicoesPorComp[comp] || {};
    medicoesPorComp[comp][Number(m.item)] = {
      quantidade: numeroOuNulo_(m.quantidade),
      quantidadeRelatorio: numeroOuNulo_(m.quantidadeRelatorio),
      ajusteObs: String(m.ajusteObs || '')
    };
  });

  const competencias = listar_(ABAS.COMPETENCIAS)
    .filter(function (c) { return String(c.vigencia).trim() === pedida; })
    .map(function (c) {
      const comp = textoCompetencia_(c.competencia);
      const ids = {};
      let preenchidos = 0;
      CAMPOS_IDS_SEI.forEach(function (f) {
        ids[f.campo] = String(c[f.campo] || '').trim();
        if (ids[f.campo]) preenchidos++;
      });
      return {
        competencia: comp,
        status: String(c.status),
        statusRotulo: STATUS_ROTULOS[c.status] || String(c.status),
        medicoes: medicoesPorComp[comp] || {},
        ansUptimePct: numeroOuNulo_(c.ansUptimePct),
        ansMinutos: numeroOuNulo_(c.ansMinutos),
        ansCumprido: c.ansCumprido === '' ? null : ehVerdadeiro_(c.ansCumprido),
        ansObs: String(c.ansObs || ''),
        ids: ids,
        idsPreenchidos: preenchidos,
        dataEnvio: dataIso_(c.dataEnvioCogecon),
        pastaDrive: String(c.pastaDrive || '')
      };
    })
    .sort(function (a, b) { return a.competencia < b.competencia ? 1 : -1; });

  return {
    vigencias: vigencias.map(function (v) { return { id: v.id, rotulo: v.rotulo }; }),
    vigencia: pedida,
    itens: listarItens_(),
    competencias: competencias
  };
}

/** Campo do CSV: aspas quando houver ";", aspas ou quebra de linha. */
function celulaCsv_(valor) {
  const texto = (valor === null || valor === undefined) ? '' : String(valor);
  return /[;"\r\n]/.test(texto) ? '"' + texto.replace(/"/g, '""') + '"' : texto;
}
