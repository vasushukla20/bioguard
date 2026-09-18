import test from 'node:test';
import assert from 'node:assert/strict';
import PhysicsEngine from '../frontend/js/classes/PhysicsEngine.js';
import {SCENARIOS, JOINTS} from '../frontend/js/utils/constants.js';
const engine = new PhysicsEngine({weight:75,height:175,age:30});
test('every scenario produces finite forces and bounded scores at load extremes', () => {
  for (const scenario of Object.values(SCENARIOS)) for (const load of [0,50]) {
    const result=engine.getFullAnalysis(scenario.defaultAngles,load,480);
    for (const joint of JOINTS) {
      assert(Number.isFinite(result.jointForces[joint]));
      assert(result.jointForces[joint]>=0);
      assert(result.riskScores[joint]>=0 && result.riskScores[joint]<=100);
    }
  }
});
test('external load increases estimated forces without changing posture', () => {
  const angles={trunk:30,knee:60,hip:60};
  const before=engine.calculateJointForces(angles,0), after=engine.calculateJointForces(angles,25);
  for(const joint of JOINTS) assert(after[joint]>before[joint]);
});
test('longer exposure changes projection without pretending to change instantaneous force', () => {
  const short=engine.getFullAnalysis({trunk:30,knee:60,hip:60},10,15);
  const long=engine.getFullAnalysis({trunk:30,knee:60,hip:60},10,480);
  assert.deepEqual(short.jointForces,long.jointForces);
  assert.notDeepEqual(short.longTermProjection,long.longTermProjection);
});
