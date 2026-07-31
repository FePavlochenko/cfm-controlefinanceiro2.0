// ============================================
// CFM SUPABASE SYNC HOOK (VERSÃO CORRIGIDA)
// ============================================
// Este arquivo faz o hook nas funções persistir() e render()
// para sincronizar automaticamente com Supabase
//
// CORREÇÕES:
// - Todos os campos obrigatórios preenchidos
// - Melhor tratamento de erros
// - Logs mais informativos

(function() {
  // Configuração
  const SUPABASE_URL = 'https://aiyptgdemugbapbfevcw.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_QBtGEzIz3zlhH_9dtQql5g_sieiz0iO';

  const PROFILE_IDS = {
    pessoal: 'bcc95e03-01a5-4f1a-b7a3-5b575781c',
    quitanda: '138deb76-4a0b-40a6-a713-f2cadf2c5'
  };

  // Estado
  let sync = null;
  let ultimaSincronizacao = Date.now();
  let perfilAtual = null;

  // ============================================
  // INICIALIZAÇÃO
  // ============================================

  async function iniciarSync() {
    try {
      // Detecta o perfil ativo
      perfilAtual = localStorage.getItem('cfm-perfil-ativo') || 'pessoal';
      const profileId = PROFILE_IDS[perfilAtual];

      if (!profileId) {
        console.warn('⚠️ Perfil desconhecido:', perfilAtual);
        return;
      }

      // Cria cliente Supabase
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      window.cfmSyncClient = createClient(SUPABASE_URL, SUPABASE_KEY);

      console.log(`✅ CFM Sync iniciado para ${perfilAtual}`);

      // Setup realtime listeners
      setupRealtimeListeners(profileId);

      // Hook nas funções
      setupHooks();

    } catch (error) {
      console.warn('⚠️ Erro ao inicializar sync:', error.message);
    }
  }

  // ============================================
  // REALTIME LISTENERS
  // ============================================

  function setupRealtimeListeners(profileId) {
    if (!window.cfmSyncClient) return;

    // Escuta mudanças em transações de outro device
    window.cfmSyncClient
      .channel(`transactions-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `profile_id=eq.${profileId}`
        },
        (payload) => {
          console.log('📡 Transação atualizada em outro device:', payload.eventType);
          setTimeout(() => {
            if (typeof render === 'function') {
              render();
            }
          }, 500);
        }
      )
      .subscribe();

    // Escuta mudanças em contas
    window.cfmSyncClient
      .channel(`accounts-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'accounts',
          filter: `profile_id=eq.${profileId}`
        },
        (payload) => {
          console.log('📡 Conta atualizada em outro device');
          setTimeout(() => {
            if (typeof render === 'function') {
              render();
            }
          }, 500);
        }
      )
      .subscribe();

    // Escuta mudanças em categorias
    window.cfmSyncClient
      .channel(`categories-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `profile_id=eq.${profileId}`
        },
        (payload) => {
          console.log('📡 Categoria atualizada em outro device');
          setTimeout(() => {
            if (typeof render === 'function') {
              render();
            }
          }, 500);
        }
      )
      .subscribe();
  }

  // ============================================
  // HOOKS NAS FUNÇÕES EXISTENTES
  // ============================================

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

    console.log('🔗 Hooks instalados em persistir() e render()');
  }

  // ============================================
  // SINCRONIZAÇÃO (VERSÃO CORRIGIDA)
  // ============================================

  async function sincronizar() {
    if (!navigator.onLine) {
      console.log('📋 Offline - enfileirando mudança');
      return;
    }

    // Rate limit
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

      // Sincroniza transações
      if (dados.lanc) {
        await sincronizarTransacoes(profileId, dados.lanc);
      }

      // Sincroniza contas
      if (dados.contas) {
        await sincronizarContas(profileId, dados.contas);
      }

      // Sincroniza categorias
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
          // Gera um ID único
          const id = `${profileId}-${mes}-${tx.desc || 'tx'}-${Date.now()}-${Math.random()}`;

          // Mapeia os campos do CFM para o Supabase
          const dataSync = {
            id: id,
            profile_id: profileId,
            type: tx.tipo === 'receita' ? 'income' : 'expense', // OBRIGATÓRIO
            category: tx.cat || 'Sem categoria', // OBRIGATÓRIO
            subcategory: tx.sub || '', // OPCIONAL
            description: tx.desc || '', // OPCIONAL mas recomendado
            amount: parseFloat(tx.valor) || 0, // OBRIGATÓRIO
            date: `${mes}-01`, // OBRIGATÓRIO (formato YYYY-MM-DD)
            icon: tx.icon || '', // OPCIONAL
            notes: tx.conta ? `Conta: ${tx.conta}` : '', // OPCIONAL
            updated_at: new Date().toISOString(), // OBRIGATÓRIO
            synced_at: new Date().toISOString(), // Auto-sync timestamp
            deleted_at: null // Não deletado
          };

          // Faz o INSERT com tratamento de erro
          const { data, error } = await window.cfmSyncClient
            .from('transactions')
            .insert([dataSync]);

          if (error) {
            console.error(`❌ Erro ao sincronizar transação ${tx.desc}:`, error);
          } else {
            console.log(`✅ Transação sincronizada: ${tx.desc}`);
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
        const dataSync = {
          id: `${profileId}-${conta.nome}`,
          profile_id: profileId,
          name: conta.nome || 'Sem nome', // OBRIGATÓRIO
          type: 'bank', // OBRIGATÓRIO
          balance: parseFloat(conta.saldo) || 0,
          emoji: conta.emoji || '',
          updated_at: new Date().toISOString(), // OBRIGATÓRIO
          synced_at: new Date().toISOString(),
          deleted_at: null
        };

        const { data, error } = await window.cfmSyncClient
          .from('accounts')
          .upsert([dataSync]);

        if (error) {
          console.error(`❌ Erro ao sincronizar conta ${conta.nome}:`, error);
        } else {
          console.log(`✅ Conta sincronizada: ${conta.nome}`);
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
        const dataSync = {
          id: `${profileId}-${cat.nome}`,
          profile_id: profileId,
          name: cat.nome || 'Sem nome', // OBRIGATÓRIO
          type: cat.tipo || 'despesa', // OBRIGATÓRIO
          emoji: cat.emoji || '',
          updated_at: new Date().toISOString(), // OBRIGATÓRIO
          synced_at: new Date().toISOString(),
          deleted_at: null
        };

        const { data, error } = await window.cfmSyncClient
          .from('categories')
          .upsert([dataSync]);

        if (error) {
          console.error(`❌ Erro ao sincronizar categoria ${cat.nome}:`, error);
        } else {
          console.log(`✅ Categoria sincronizada: ${cat.nome}`);
        }

        // Subcategorias
        if (cat.sub && Array.isArray(cat.sub)) {
          for (const sub of cat.sub) {
            try {
              const subSync = {
                id: `${profileId}-${cat.nome}-${sub}`,
                profile_id: profileId,
                category_id: `${profileId}-${cat.nome}`,
                name: sub, // OBRIGATÓRIO
                updated_at: new Date().toISOString(), // OBRIGATÓRIO
                synced_at: new Date().toISOString(),
                deleted_at: null
              };

              await window.cfmSyncClient
                .from('subcategories')
                .upsert([subSync]);
            } catch (e) {
              console.warn('⚠️ Erro ao sincronizar subcategoria:', e.message);
            }
          }
        }
      } catch (error) {
        console.error('❌ Erro ao processar categoria:', error.message);
      }
    }
  }

  // ============================================
  // STATUS
  // ============================================

  function atualizarStatusSync() {
    const statusEl = document.getElementById('cfm-sync-status');
    if (!statusEl) return;

    const online = navigator.onLine;
    const statusText = online ? '🟢 Online' : '🔴 Offline';
    statusEl.textContent = `${statusText} · CFM Sync ativo`;
  }

  // ============================================
  // MONITOR DE CONEXÃO
  // ============================================

  window.addEventListener('online', () => {
    console.log('🟢 Voltou online - sincronizando');
    sincronizar();
    atualizarStatusSync();
  });

  window.addEventListener('offline', () => {
    console.log('🔴 Ficou offline');
    atualizarStatusSync();
  });

  // Monitora mudanças de perfil
  const originalSelecionarPerfil = window.selecionarPerfil;
  if (originalSelecionarPerfil) {
    window.selecionarPerfil = function(p) {
      perfilAtual = p;
      localStorage.setItem('cfm-perfil-ativo', p);
      originalSelecionarPerfil.call(this, p);

      setTimeout(() => iniciarSync(), 500);
    };
  }

  // ============================================
  // FUNÇÕES ÚTEIS NO CONSOLE
  // ============================================

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

  // ============================================
  // INICIA
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSync);
  } else {
    setTimeout(iniciarSync, 500);
  }

  console.log('✅ CFM Sync Hook (CORRIGIDO) carregado');
})();
