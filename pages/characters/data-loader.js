// pages/characters/data-loader.js
// 数据加载和实时同步

import { supaClient, setSyncStatus } from '../../core/supabase-client.js';
import * as State from './state.js';

/**
 * 加载所有数据
 */
export async function loadAllData() {
  setSyncStatus('syncing');
  try {
    const [chars, countries, cities, landmarks] = await Promise.all([
      supaClient.from('characters').select('*').order('name'),
      supaClient.from('countries').select('*').order('name'),
      supaClient.from('cities').select('*').order('name'),
      supaClient.from('landmarks').select('*').order('created_at')
    ]);
    
    State.setAllChars(chars.data || []);
    State.setAllCountries(countries.data || []);
    State.setAllCities(cities.data || []);
    State.setAllLandmarks(landmarks.data || []);
    
    setSyncStatus('ok');
    return true;
  } catch (e) {
    console.error('Failed to load data:', e);
    setSyncStatus('error');
    return false;
  }
}

/**
 * 订阅实时更新
 */
export function subscribeRealtime(onUpdate) {
  // 人物表监听
  const charsChannel = supaClient.channel('chars-intro')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'characters' }, 
      () => loadAllData().then(onUpdate)
    )
    .subscribe();
  
  // 地理表监听
  const geoChannel = supaClient.channel('geo-data')
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'countries' }, 
      () => loadAllData().then(onUpdate)
    )
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'cities' }, 
      () => loadAllData().then(onUpdate)
    )
    .on('postgres_changes', 
      { event: '*', schema: 'public', table: 'landmarks' }, 
      () => loadAllData().then(onUpdate)
    )
    .subscribe();
  
  State.setCharsChannel(charsChannel);
  State.setGeoChannel(geoChannel);
}

/**
 * 取消订阅
 */
export function unsubscribeRealtime() {
  if (State.charsChannel) supaClient.removeChannel(State.charsChannel);
  if (State.geoChannel) supaClient.removeChannel(State.geoChannel);
}
