// ============================================
// CFM SUPABASE SYNC HOOK
// ============================================
// Este arquivo faz o hook nas funções persistir() e render()
// para sincronizar automaticamente com Supabase
//
// Basta adicionar ANTES do </body>:
// <script src="./cfm-sync-hook.js"></script>

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
  let fila = [];
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

      // Sincroniza dados ao iniciar
      await sincronizarAgora(profileId);

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
          // Aguarda 500ms e recarrega
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
    // Guarda as funções originais
    const originalPersistir = window.persistir;
    const originalRender = window.render;

    // Hook no persistir()
    window.persistir = function() {
      // Chama o original
      if (originalPersistir) originalPersistir.call(this);

      // Sincroniza com Supabase
      sincronizar();
    };

    // Hook no render()
    window.render = function() {
      // Chama o original
      if (originalRender) originalRender.call(this);

      // Atualiza status
      atualizarStatusSync();
    };

    console.log('🔗 Hooks instalados em persistir() e render()');
  }

  // ============================================
  // SINCRONIZAÇÃO
  // ============================================

  async function sincronizar() {
    if (!navigator.onLine) {
      console.log('📋 Offline - enfileirando mudança');
      return;
    }

    // Rate limit: não sincroniza mais de 1x por segundo
    const agora = Date.now();
    if (agora - ultimaSincronizacao < 1000) {
      return;
    }
    ultimaSincronizacao = agora;

    try {
      const profileId = PROFILE_IDS[perfilAtual || 'pessoal'];
      if (!profileId || !window.cfmSyncClient) return;

      // Pega dados do localStorage
      const dados = JSON.parse(localStorage.getItem(`cfm-v4-perfil-${perfilAtual}`) || '{}');

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
        const id = `${profileId}-${mes}-${tx.desc}-${tx.valor}-${Date.now()}`;
        
        try {
          await window.cfmSyncClient.from('transactions').upsert({
            id,
            profile_id: profileId,
            type: tx.tipo === 'receita' ? 'income' : 'expense',
            category: tx.cat || 'Sem categoria',
            subcategory: tx.sub || '',
            description: tx.desc,
            amount: parseFloat(tx.valor) || 0,
            date: mes + '-01',
            updated_at: new Date().toISOString()
          });
        } catch (error) {
          console.warn('⚠️ Erro ao sincronizar transação:', error.message);
        }
      }
    }
  }

  async function sincronizarContas(profileId, contas) {
    if (!window.cfmSyncClient || !Array.isArray(contas)) return;

    for (const conta of contas) {
      try {
        await window.cfmSyncClient.from('accounts').upsert({
          id: `${profileId}-${conta.nome}`,
          profile_id: profileId,
          name: conta.nome,
          type: 'bank',
          balance: conta.saldo || 0,
          emoji: conta.emoji || '',
          updated_at: new Date().toISOString()
        });
      } catch (error) {
        console.warn('⚠️ Erro ao sincronizar conta:', error.message);
      }
    }
  }

  async function sincronizarCategorias(profileId, categorias) {
    if (!window.cfmSyncClient || !Array.isArray(categorias)) return;

    for (const cat of categorias) {
      try {
        await window.cfmSyncClient.from('categories').upsert({
          id: `${profileId}-${cat.nome}`,
          profile_id: profileId,
          name: cat.nome,
          type: cat.tipo,
          emoji: cat.emoji || '',
          updated_at: new Date().toISOString()
        });

        // Subcategorias
        if (cat.sub && Array.isArray(cat.sub)) {
          for (const sub of cat.sub) {
            try {
              await window.cfmSyncClient.from('subcategories').upsert({
                id: `${profileId}-${cat.nome}-${sub}`,
                profile_id: profileId,
                category_id: `${profileId}-${cat.nome}`,
                name: sub,
                updated_at: new Date().toISOString()
              });
            } catch (e) {
              console.warn('⚠️ Erro ao sincronizar subcategoria:', e.message);
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Erro ao sincronizar categoria:', error.message);
      }
    }
  }

  async function sincronizarAgora(profileId) {
    console.log('🔄 Sincronizando dados agora...');
    await sincronizar();
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
      
      // Reinicia sync para novo perfil
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
    const profileId = PROFILE_IDS[perfilAtual || 'pessoal'];
    return sincronizarAgora(profileId);
  };

  // ============================================
  // INICIA
  // ============================================

  // Espera o DOM carregar e depois inicia
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarSync);
  } else {
    setTimeout(iniciarSync, 500);
  }

  console.log('✅ CFM Sync Hook carregado');
})();
