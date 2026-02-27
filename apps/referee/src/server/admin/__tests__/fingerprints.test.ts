import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTournamentNameStateSeasonFingerprint,
  buildTournamentNameUrlFingerprint,
  buildTournamentUrlFingerprint,
  buildVenueAddressFingerprint,
  buildVenueNameCityStateFingerprint,
  normalizeIdentityStreet,
  normalizeIdentityUrlHost,
} from '@/lib/identity/fingerprints';

test('venue address fingerprint normalizes suite and street variants', () => {
  const fingerprint = buildVenueAddressFingerprint({
    address1: '123 Main Street Suite 200',
    city: 'Charlotte',
    state: 'NC',
  });
  assert.equal(fingerprint, '123 main st|charlotte|nc');
  assert.equal(normalizeIdentityStreet('123 Main St. #200'), '123 main st');
});

test('venue name-city fingerprint requires full locality', () => {
  assert.equal(
    buildVenueNameCityStateFingerprint({ name: 'Bailey Road Park (Bailey)', city: 'Cornelius', state: 'NC' }),
    'bailey road park bailey|cornelius|nc'
  );
  assert.equal(buildVenueNameCityStateFingerprint({ name: 'Bailey Road Park', city: null, state: 'NC' }), '');
});

test('tournament url fingerprint strips protocol, www, query, and trailing slash', () => {
  assert.equal(
    buildTournamentUrlFingerprint('https://www.example.com/events/spring-cup/?utm_source=test'),
    'example.com/events/spring-cup'
  );
  assert.equal(normalizeIdentityUrlHost('https://www.example.com/events/spring-cup/?utm_source=test'), 'example.com');
});

test('tournament fingerprints align by name+url and name+state+season', () => {
  assert.equal(
    buildTournamentNameUrlFingerprint({
      name: '2026 CISC Race City Classic',
      officialWebsiteUrl: 'https://www.example.com/tournament/race-city-classic?ref=abc',
    }),
    '2026 cisc race city classic|example.com/tournament/race-city-classic'
  );

  assert.equal(
    buildTournamentNameStateSeasonFingerprint({
      name: 'CISC Race City Classic',
      state: 'NC',
      startDate: '2026-05-21',
      endDate: '2026-05-24',
    }),
    'cisc race city classic|nc|2026'
  );

  assert.equal(
    buildTournamentNameStateSeasonFingerprint({
      name: 'CISC Race City Classic',
      state: 'NC',
      startDate: null,
      endDate: null,
    }),
    ''
  );
});
