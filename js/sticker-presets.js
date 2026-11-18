/* v187：貼紙整圖預設 —「我的版本」＝南勛在 maker 親調的參數（由他匯出的 JSON 原樣收錄）；「標準版」＝圖庫預設參數的常用整圖 */
window.MOKE_STICKER_PRESETS = {
 "mine": [
  {
   "name": "彈簧振子（無力圖）",
   "item": {
    "type": "springOscillator",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.6785714285714284,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 360,
    "height": 130,
    "params": {
     "length": 155,
     "amplitude": 44,
     "mass": 52,
     "geometryVersion": 2,
     "showReference": 1,
     "showForce": 0
    }
   }
  },
  {
   "name": "彈簧振子（有力圖）",
   "item": {
    "type": "springOscillator",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.6785714285714284,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 360,
    "height": 130,
    "params": {
     "length": 155,
     "amplitude": 44,
     "mass": 52,
     "geometryVersion": 2,
     "showReference": 1,
     "showForce": 1
    }
   }
  },
  {
   "name": "自由體圖・斜面",
   "item": {
    "type": "freeBodyDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.586206896551724,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 300,
    "height": 280,
    "params": {
     "schemaVersion": 2,
     "incline": 25,
     "bodyKind": 0,
     "showBodyLabel": 1,
     "showSurface": 1,
     "showForces": 1,
     "forces": [
      {
       "id": "gravity",
       "label": "mg",
       "magnitude": 88,
       "mode": "vertical",
       "direction": 1,
       "angle": -90
      },
      {
       "id": "normal",
       "label": "N",
       "magnitude": 76,
       "mode": "normal",
       "direction": 1,
       "angle": 115
      },
      {
       "id": "friction",
       "label": "f",
       "magnitude": 48,
       "mode": "tangent",
       "direction": -1,
       "angle": 25
      }
     ]
    }
   }
  },
  {
   "name": "單擺 15°",
   "item": {
    "type": "pendulum",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 100,
    "height": 150,
    "params": {
     "length": 112,
     "angle": 15,
     "bobRadius": 13,
     "lockLength": 0
    }
   }
  },
  {
   "name": "阿特伍德機",
   "item": {
    "type": "atwoodMachine",
    "x": 560,
    "y": 260,
    "rotation": 0,
    "scale": 1.4354066985645935,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 190,
    "height": 270,
    "params": {
     "radius": 50,
     "ropeLength": 250,
     "displacement": 20,
     "leftMass": 1,
     "rightMass": 4
    }
   }
  },
  {
   "name": "行星橢圓軌道",
   "item": {
    "type": "orbitDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 280,
    "height": 210,
    "params": {
     "major": 115,
     "minor": 74,
     "position": 35,
     "direction": 1,
     "showVelocity": 0
    }
   }
  },
  {
   "name": "正弦波",
   "item": {
    "type": "sineWave",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 150,
    "height": 72,
    "params": {
     "length": 150,
     "amplitude": 28,
     "wavelength": 75,
     "phase": 0,
     "direction": 0,
     "showBaseline": 0,
     "startX": -75
    }
   }
  },
  {
   "name": "單縫繞射波",
   "item": {
    "type": "diffraction",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 150,
    "height": 120,
    "params": {
     "range": 150,
     "height": 120,
     "wavelength": 24,
     "aperture": 22,
     "separation": 0
    }
   }
  },
  {
   "name": "雙縫干涉波",
   "item": {
    "type": "interference",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 160,
    "height": 130,
    "params": {
     "range": 195,
     "height": 208,
     "wavelength": 22,
     "separation": 65,
     "aperture": 0
    }
   }
  },
  {
   "name": "電偶極場線",
   "item": {
    "type": "electricDipoleField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.9411764705882346,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 300,
    "height": 210,
    "params": {
     "separation": 105,
     "extent": 82,
     "lines": 7,
     "polarity": 1
    }
   }
  },
  {
   "name": "點電荷場線（正）",
   "item": {
    "type": "electricFieldPoint",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.8846153846153846,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 210,
    "height": 210,
    "params": {
     "extent": 92,
     "lines": 8,
     "rings": 2,
     "sign": 1
    }
   }
  },
  {
   "name": "點電荷場線（負）",
   "item": {
    "type": "electricFieldPoint",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.8846153846153846,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 210,
    "height": 210,
    "params": {
     "extent": 92,
     "lines": 8,
     "rings": 2,
     "sign": -1
    }
   }
  },
  {
   "name": "同號電荷場線",
   "item": {
    "type": "likeChargeField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.9411764705882355,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 310,
    "height": 220,
    "params": {
     "separation": 105,
     "extent": 82,
     "lines": 8,
     "sign": 1
    }
   }
  },
  {
   "name": "平行板電場",
   "item": {
    "type": "parallelPlateField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.6666666666666665,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 180,
    "height": 230,
    "params": {
     "separation": 118,
     "height": 185,
     "arrows": 7,
     "polarity": 1
    }
   }
  },
  {
   "name": "均勻磁場（入紙面）",
   "item": {
    "type": "uniformMagneticField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 230,
    "height": 170,
    "params": {
     "width": 210,
     "height": 150,
     "columns": 5,
     "rows": 4,
     "direction": 1
    }
   }
  },
  {
   "name": "均勻磁場（出紙面）",
   "item": {
    "type": "uniformMagneticField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 230,
    "height": 170,
    "params": {
     "width": 210,
     "height": 150,
     "columns": 5,
     "rows": 4,
     "direction": -1
    }
   }
  },
  {
   "name": "條形磁鐵場線",
   "item": {
    "type": "barMagnetField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.727272727272727,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 300,
    "height": 220,
    "params": {
     "northSide": -1,
     "showArrows": 1,
     "length": 150,
     "height": 52,
     "lines": 4
    }
   }
  },
  {
   "name": "直導線磁場",
   "item": {
    "type": "wireMagneticField",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.8846153846153846,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 220,
    "height": 220,
    "params": {
     "radius": 92,
     "rings": 4,
     "current": 1
    }
   }
  },
  {
   "name": "磁鐵與線圈感應",
   "item": {
    "type": "inductionCoil",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 1.991150442477876,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 390,
    "height": 180,
    "params": {
     "distance": 90,
     "turns": 5,
     "motion": 55,
     "motionDirection": 1,
     "motionLength": 55,
     "nearPole": 1,
     "showResponse": 0
    }
   }
  },
  {
   "name": "載流導線在磁場中",
   "item": {
    "type": "conductorForce",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 3,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 390,
    "height": 230,
    "params": {
     "currentDirection": 1,
     "fieldDirection": -1,
     "showForce": 0,
     "length": 180,
     "fieldWidth": 250,
     "force": 72
    }
   }
  },
  {
   "name": "氫原子能階",
   "item": {
    "type": "energyLevelDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 1.5463917525773196,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "width": 410,
    "height": 360,
    "params": {
     "width": 280,
     "height": 280,
     "levels": 5,
     "fromLevel": 4,
     "toLevel": 2,
     "transition": 3,
     "transitionMode": 0,
     "transitions": [
      [
       4,
       2
      ],
      [
       2,
       0
      ]
     ],
     "solutionMode": 0,
     "showEnergies": 1
    }
   }
  }
 ],
 "std": [
  {
   "name": "凸透鏡成像・2F 外",
   "item": {
    "type": "lensRayDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "objectDistance": 150,
     "focalLength": 62,
     "objectHeight": 72,
     "solutionMode": 1,
     "showFoci": 1
    }
   }
  },
  {
   "name": "凸透鏡成像・2F 上",
   "item": {
    "type": "lensRayDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "objectDistance": 124,
     "focalLength": 62,
     "objectHeight": 72,
     "solutionMode": 1,
     "showFoci": 1
    }
   }
  },
  {
   "name": "凸透鏡成像・焦點內",
   "item": {
    "type": "lensRayDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "objectDistance": 40,
     "focalLength": 62,
     "objectHeight": 72,
     "solutionMode": 1,
     "showFoci": 1
    }
   }
  },
  {
   "name": "凹透鏡成像",
   "item": {
    "type": "concaveLensRayDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "objectDistance": 180,
     "focalLength": 90,
     "objectHeight": 56,
     "solutionMode": 1,
     "showFoci": 1
    }
   }
  },
  {
   "name": "凹面鏡成像",
   "item": {
    "type": "mirrorRayDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "objectDistance": 170,
     "focalLength": 68,
     "objectHeight": 70,
     "solutionMode": 1,
     "showFoci": 1
    }
   }
  },
  {
   "name": "串聯電路",
   "item": {
    "type": "seriesCircuitDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "resistors": 2,
     "switchAngle": 28
    }
   }
  },
  {
   "name": "並聯電路",
   "item": {
    "type": "parallelCircuitDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "resistors": 2
    }
   }
  },
  {
   "name": "弦上駐波",
   "item": {
    "type": "standingWave",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.4,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "harmonic": 2
    }
   }
  },
  {
   "name": "開管駐波",
   "item": {
    "type": "openPipeStandingWave",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.4,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "harmonic": 1
    }
   }
  },
  {
   "name": "閉管駐波",
   "item": {
    "type": "closedPipeStandingWave",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.4,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {
     "harmonic": 1
    }
   }
  },
  {
   "name": "氫原子光譜",
   "item": {
    "type": "hydrogenSpectrum",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "雙狹縫實驗裝置",
   "item": {
    "type": "doubleSlitExperiment",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.0,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "陰極射線管",
   "item": {
    "type": "cathodeRayTube",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "光電效應實驗裝置",
   "item": {
    "type": "photoelectricApparatus",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "拋體軌跡",
   "item": {
    "type": "projectilePath",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.4,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "圓周運動",
   "item": {
    "type": "circularMotion",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.4,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  },
  {
   "name": "折射作圖",
   "item": {
    "type": "refractionDiagram",
    "x": 600,
    "y": 400,
    "rotation": 0,
    "scale": 2.2,
    "strokeWidth": 2,
    "label": "",
    "flippedX": false,
    "flippedY": false,
    "params": {}
   }
  }
 ]
};
