// ============================================
// CFM SUPABASE SYNC HOOK (VERSÃO FINAL)
// ============================================
// SEM ENVIAR ID - Deixa Supabase gerar automaticamente

(function() {
  const SUPABASE_URL = 'https://aiyptgdemugbapbfevcw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_QBtGEzIz3zlhH_9dtQql5g_sieiz0iO';

  const PROFILE_IDS = {
    pessoal: 'bcc95e03-01a5-4f1a-b7a3-5b575781c428',
    quitanda: '138deb76-4a0b-40a6-a713-f2cadf2c5160'
  };

  let ultimaSincronizacao = Date.now();
  let perfilAtual = null;

  async function iniciarSync() {
    try {
      perfilAtual = localStorage.getItem('cfm-perfil-ativo') || 'pessoal';
      const profileId = PROFILE_IDS[perfilAtual];

      if (!profileId) {
        console.warn('⚠️ Perfil desconhecido:', perfilAtual);
        return;
      }

      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      window.cfmSyncClient = createClient(SUPABASE_URL, SUPABASE_KEY);

      console.log(`✅ CFM Sync iniciado para ${perfilAtual}`);

      setupRealtimeListeners(profileId);
      setupHooks();

    } catch (error) {
      console.warn('⚠️ Erro ao inicializar sync:', error.message);
    }
  }

  function setupRealtimeListeners(profileId) {
    if (!window.cfmSyncClient) return;

    window.cfmSyncClient
      .channel(`transactions-${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'transactions',
        filter: `profile_id=eq.${profileId}`
      }, () => {
        console.log('📡 Transação atualizada em outro device');
        setTimeout(() => {
          if (typeof render === 'function') render();
        }, 500);
      })
      .subscribe();

    window.cfmSyncClient
      .channel(`accounts-${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'accounts',
        filter: `profile_id=eq.${profileId}`
      }, () => {
        console.log('📡 Conta atualizada em outro device');
        setTimeout(() => {
          if (typeof render === 'function') render();
        }, 500);
      })
      .subscribe();

    window.cfmSyncClient
      .channel(`categories-${profileId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'categories',
        filter: `profile_id=eq.${profileId}`
      }, () => {
        console.log('📡 Categoria atualizada em outro device');
        setTimeout(() => {
          if (typeof render === 'function') render();
        }, 500);
      })
      .subscribe();
  }

  function setupHooks() {
    const originalPersistir = window.persistir;
    const originalRender = window.render;

    window.persistir = function() {
      if (originalPersistir) originalPersistir.call(this);
      sincronizar();
    };

    window.render = function() {
      if (originalRender) originalRender.call(this);
      atualizarStatusSync();
    };

    console.log('🔗 Hooks instalados');
  }

  async function sincronizar() {
    if (!navigator.onLine) {
      console.log('📋 Offline');
      return;
    }

    const agora = Date.now();
    if (agora - ultimaSincronizacao < 1000) {
      return;
    }
    ultimaSincronizacao = agora;

    try {
      const profileId = PROFILE_IDS[perfilAtual || 'pessoal'];
      if (!profileId || !window.cfmSyncClient) return;

      const dados = JSON.parse(localStorage.getItem(`cfm-v4-${perfilAtual}`) || '{}');

      if (!dados || Object.keys(dados).length === 0) {
        return;
      }

      if (dados.lanc) {
        await sincronizarTransacoes(profileId, dados.lanc);
      }

      if (dados.contas) {
        await sincronizarContas(profileId, dados.contas);
      }

      if (dados.cats) {
        await sincronizarCategorias(profileId, dados.cats);
      }

      console.log('✅ Sincronização concluída');
    } catch (error) {
      console.error('❌ Erro ao sincronizar:', error.message);
    }
  }

  async function sincronizarTransacoes(profileId, lancamentos) {
    if (!window.cfmSyncClient || !lancamentos) return;

    for (const [mes, transacoes] of Object.entries(lancamentos)) {
      if (!Array.isArray(transacoes)) continue;

      for (const tx of transacoes) {
        try {
          const mesNum = String(mes).padStart(2, '0');
          const dataFormatada = `2026-${mesNum}-01`;

          // ✅ NÃO ENVIA ID - Deixa Supabase gerar
          const dataSync = {
            profile_id: profileId,
            type: tx.tipo === 'receita' ? 'income' : 'expense',
            category: tx.cat || 'Sem categoria',
            subcategory: tx.sub || '',
            description: tx.desc || '',
            amount: parseFloat(tx.valor) || 0,
            date: dataFormatada,
            icon: tx.icon || '',
            notes: tx.conta ? `Conta: ${tx.conta}` : '',
            updated_at: new Date().toISOString(),
            synced_at: new Date().toISOString()
          };

          const { data, error } = await window.cfmSyncClient
            .from('transactions')
            .insert([dataSync]);

          if (error) {
            console.error(`❌ Erro transação ${tx.desc}:`, error.message);
          } else {
            console.log(`✅ Transação: ${tx.desc} (${dataFormatada})`);
          }
        } catch (error) {
          console.error('❌ Erro ao processar transação:', error.message);
        }
      }
    }
  }

  async function sincronizarContas(profileId, contas) {
    if (!window.cfmSyncClient || !Array.isArray(contas)) return;

    for (const conta of contas) {
      try {
        // ✅ NÃO ENVIA ID
        const dataSync = {
          profile_id: profileId,
          name: conta.nome || 'Sem nome',
          type: 'bank',
          balance: parseFloat(conta.saldo) || 0,
          emoji: conta.emoji || '',
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString()
        };

        const { data, error } = await window.cfmSyncClient
          .from('accounts')
          .insert([dataSync]);

        if (error) {
          console.error(`❌ Erro conta ${conta.nome}:`, error.message);
        } else {
          console.log(`✅ Conta: ${conta.nome}`);
        }
      } catch (error) {
        console.error('❌ Erro ao processar conta:', error.message);
      }
    }
  }

  async function sincronizarCategorias(profileId, categorias) {
    if (!window.cfmSyncClient || !Array.isArray(categorias)) return;

    for (const cat of categorias) {
      try {
        // ✅ NÃO ENVIA ID
        const dataSync = {
          profile_id: profileId,
          name: cat.nome || 'Sem nome',
          type: cat.tipo || 'despesa',
          emoji: cat.emoji || '',
          updated_at: new Date().toISOString(),
          synced_at: new Date().toISOString()
        };

        const { data, error } = await window.cfmSyncClient
          .from('categories')
          .insert([dataSync]);

        if (error) {
          console.error(`❌ Erro categoria ${cat.nome}:`, error.message);
        } else {
          console.log(`✅ Categoria: ${cat.nome}`);
        }

        if (cat.sub && Array.isArray(cat.sub)) {
          for (const sub of cat.sub) {
            try {
              const subSync = {
                profile_id: profileId,
                category_id: `${profileId}-${cat.nome}`,
                name: sub,
                updated_at: new Date().toISOString(),
                synced_at: new Date().toISOString()
              };

              await window.cfmSyncClient
                .from('subcategories')
                .insert([subSync]);
            } catch (e) {
              console.warn('⚠️ Erro subcategoria:', e.message);
            }
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar categoria:', error.message);
      }
    }
  }

  function atualizarStatusSync() {
    const statusEl = document.getElementById('cfm-sync-status');
    if (!statusEl) return;

    const online = navigator.onLine;
    const statusText = online ? '🟢 Online' : '🔴 Offline';
    statusEl.textContent = `${statusText} · CFM Sync`;
  }

  window.addEventListener('online', () => {
    console.log('🟢 Online');
    sincronizar();
    atualizarStatusSync();
  });

  window.addEventListener('offline', () => {
    console.log('🔴 Offline');
    atualizarStatusSync();
  });

  const originalSelecionarPerfil = window.selecionarPerfil;
  if (originalSelecionarPerfil) {
    window.selecionarPerfil = function(p) {
      perfilAtual = p;
      localStorage.setItem('cfm-perfil-ativo', p);
      originalSelecionarPerfil.call(this, p);
      setTimeout(() => iniciarSync(), 500);
    };
  }

  window.CFMSyncStatus = function() {
    return {
      online: navigator.onLine,
      perfil: perfilAtual,
      timestamp: new Date().toLocaleString('pt-BR')
    };
  };

  window.CFMSyncAgora = function() {
    console.log('🔄 Sincronizando agora...');
    return sincronizar();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSync);
  } else {
    setTimeout(iniciarSync, 500);
  }

  console.log('✅ CFM Sync Hook (FINAL) carregado');
})();
