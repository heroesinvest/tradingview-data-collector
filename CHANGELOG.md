# Changelog - TradingView Data Collector

## 2025-10-01 - UI Improvements

### 🎨 Separate PreData/PostData Last Entry Displays
**Problema:** Havia apenas um campo "Last Entry" que alternava entre PreData e PostData, dificultando acompanhar ambos os tipos simultaneamente.

**Solução:** 
```
┌─────────────────────┬─────────────────────┐
│  Last Entry         │  Last Entry         │
│  PreData            │  PostData           │
│  2022-12-30 10:00  │  2022-12-30 10:15  │
└─────────────────────┴─────────────────────┘
```
- Dois campos lado a lado (grid 1fr 1fr)
- **PreData**: Fundo marrom (#3a2a1a), borda laranja (#FF9800)
- **PostData**: Fundo verde escuro (#1a3a1a), borda verde (#4CAF50)
- Atualização independente conforme cada tipo é coletado

### 🖱️ Fix Drag Issue - Window Stuck at Bottom
**Problema:** Ao tentar arrastar a janela, ela ficava com o `bottom` preso e redimensionava ao invés de mover.

**Causa Raiz:** A janela era posicionada com `bottom: 20px` e `right: 20px`, e o drag não convertia para `top/left`.

**Solução:**
```javascript
function dragMouseDown(e) {
    // Converter bottom/right para top/left ANTES de iniciar drag
    if (element.style.bottom && element.style.bottom !== 'auto') {
        const rect = element.getBoundingClientRect();
        element.style.top = rect.top + 'px';
        element.style.bottom = 'auto';
    }
    if (element.style.right && element.style.right !== 'auto') {
        const rect = element.getBoundingClientRect();
        element.style.left = rect.left + 'px';
        element.style.right = 'auto';
    }
    // ... continua drag normalmente
}
```

**Resultado:** Janela agora pode ser arrastada livremente por toda a tela.

### 🔲 Replace Close Button with Minimize/Maximize
**Problema:** Botão X (close) vermelho fechava a janela, exigindo Ctrl+Shift+T para reabrir.

**Solução:** Dois botões na barra de título:
```
┌──────────────────────────────┐
│ 🚀 TV Data Collector  [_][□] │ ← Minimize (laranja) e Maximize (azul)
└──────────────────────────────┘
```

**Funcionalidades:**
- **Minimize (_)**: 
  - Cor: Laranja (#FF9800)
  - Ação: `display: none` na janela
  - Reabrir: Ctrl+Shift+T
  
- **Maximize (□)**: 
  - Cor: Azul (#2196F3)
  - Maximizado: `top/left/right/bottom: 10px` (tela cheia com margem)
  - Restaurado: Volta para posição/tamanho salvos
  - Ícone muda para ❐ quando maximizado

## 2025-10-01 - Critical Fixes

### 🔧 Date Filtering Removed
**Problema:** A extensão estava filtrando dados por data, mas isso é desnecessário porque:
- Dados sempre serão anteriores à data atual
- O modo replay do TradingView já garante que apenas dados históricos sejam mostrados
- O filtro estava removendo dados válidos

**Solução:** Removido o filtro de data em `filterAndDeduplicateEntries()`. Agora todos os dados extraídos dos Pine Logs são mantidos.

### 🔧 Lógica de Iteração Simplificada
**Problema:** A regra original era confusa:
```
- First run should be the initial date.
- Second run should be last day of the year for the initial date.
- Third run on, you must have the last day of the year for the subsequent year.
- Last run, the end date.
```

Isso causava múltiplas iterações desnecessárias através dos mesmos dados.

**Solução:** Agora coletamos **UMA VEZ por símbolo**:
- Se nenhuma data especificada → Coleta dados atuais (sem replay)
- Se data especificada → Usa data inicial para entrar em replay mode
- O scroll através dos Pine Logs coleta TODOS os dados disponíveis de uma vez
- Não há necessidade de múltiplas passagens

### 🔧 Download Imediato por Símbolo
**Problema:** A extensão coletava dados de TODOS os símbolos e só fazia download no final. Isso:
- Consumia muita memória
- Causava perda de dados se o processo fosse interrompido
- Não seguia a especificação do prompt

**Solução:** Nova função `saveCollectedDataForSymbol()`:
```javascript
async processSymbol(symbol, symbolIndex) {
    // ... coleta dados ...
    
    // DOWNLOAD IMEDIATO após completar símbolo
    await this.saveCollectedDataForSymbol(symbol);
    
    // Libera memória removendo dados salvos
}
```

Agora cada símbolo gera seu arquivo JSON **IMEDIATAMENTE** antes de passar para o próximo.

### 🔧 Detecção Melhorada do Container de Scroll
**Problema:** A extensão encontrava `.list-ETJQ6rT1` (apenas 16px de scroll) ao invés de `.container-L0IhqRpX` (>100k px de scroll).

**Solução:** Adicionada validação de scrollHeight mínimo:
- Prioriza containers com `scrollHeight > clientHeight + 1000`
- Busca especificamente por `[class*="container-"]` primeiro
- Valida que o container tem conteúdo significativo antes de usá-lo

## Resultado Esperado

### Antes:
- ❌ 100% dos dados filtrados por data
- ❌ Múltiplas iterações pelo mesmo conjunto de dados
- ❌ Download apenas no final
- ❌ Scroll em container errado (não scrollava)

### Depois:
- ✅ Todos os dados coletados (sem filtro de data)
- ✅ Uma coleta por símbolo
- ✅ Download imediato após cada símbolo
- ✅ Scroll no container correto com progressão real

## Como Testar

1. **Recarregar Extensão:**
   - Ir para `chrome://extensions/`
   - Clicar no botão reload na extensão "TradingView Pine Logs Extractor"

2. **Atualizar TradingView:**
   - Refresh (F5) na página do TradingView

3. **Testar Coleta:**
   - Carregar arquivo com múltiplos símbolos
   - Definir data inicial (ex: 2023-01-01)
   - Clicar "Start Collection"

4. **Verificar Console:**
   ```
   ✅ Found scrollable container with significant content
   ✅ ScrollHeight: 119367 ClientHeight: 1289
   ✅ Successfully parsed JSON
   ✅ Collected X entries for SYMBOL. Downloading JSON now...
   📥 Downloaded: BTCUSDT_P-60-20200111-1000-20221231-2300.json (500 entries)
   ```

5. **Verificar Downloads:**
   - Arquivos JSON baixados **imediatamente** após cada símbolo
   - Formato: `{ticker}-{timeframe}-{firstDateTime}-{lastDateTime}.json`
   - Exemplo: `BTCUSDT_P-60-20200111-1000-20221231-2300.json`

## Arquivos Modificados

- `browser-extension/content.js`:
  - `filterAndDeduplicateEntries()` - Removido filtro de data
  - `generateDateList()` - Simplificada para 1 iteração
  - `processSymbol()` - Adicionado download imediato
  - `saveCollectedDataForSymbol()` - Nova função
  - `findVirtualListContainer()` - Melhorada detecção
  - `startCollection()` - Removido download final

## Próximas Melhorias Possíveis

1. **Navegação Automática de Símbolos** - Atualmente requer seleção manual em alguns casos
2. **Barra de Progresso Visual** - Indicador de scroll progress em %
3. **Retry Logic** - Tentar novamente se download falhar
4. **Validação de JSON** - Verificar integridade antes de salvar
