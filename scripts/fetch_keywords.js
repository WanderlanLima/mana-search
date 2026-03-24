
async function getScryfallKeywords() {
  const endpoints = [
    'https://api.scryfall.com/catalog/keyword-abilities',
    'https://api.scryfall.com/catalog/keyword-actions',
    'https://api.scryfall.com/catalog/non-keyword-abilities'
  ];

  try {
    const results = await Promise.all(endpoints.map(url => fetch(url).then(res => res.json())));
    
    const keywordAbilities = results[0].data || [];
    const keywordActions = results[1].data || [];
    const nonKeywordAbilities = results[2].data || [];

    const allKeywords = [...new Set([...keywordAbilities, ...keywordActions, ...nonKeywordAbilities])].sort();

    console.log(`Total de Keywords encontradas: ${allKeywords.length}`);
    console.log(`Habilidades de Palavra-chave: ${keywordAbilities.length}`);
    console.log(`Ações de Palavra-chave: ${keywordActions.length}`);
    console.log(`Habilidades Extras (Non-keyword): ${nonKeywordAbilities.length}`);
    console.log("--- LISTA COMPLETA ---");
    console.log(JSON.stringify(allKeywords, null, 2));
    
    return {
      total: allKeywords.length,
      list: allKeywords,
      breakdown: {
        abilities: keywordAbilities,
        actions: keywordActions,
        nonKeywords: nonKeywordAbilities
      }
    };
  } catch (error) {
    console.error("Erro ao buscar keywords:", error);
  }
}

getScryfallKeywords();
