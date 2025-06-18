// CSRF-token ophalen voor veilige POST-verzoeken
function getCSRFToken() {
  const tokeElement = document.querySelector('[name=csrfmiddlewaretoken]');
  return tokeElement ? tokeElement.value : '';
}

// Logregel toevoegen met timestamp
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const timestamp = new Date().toLocaleTimeString();
  const entry = document.createElement('li');
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

//
// Viewer Setup en Rendering
//

// Viewer aanmaken voor 2D of 3D interactie
function createViewer(containerId, interactorStyle = '2D') {
  const container = document.getElementById(containerId);
  const content = container.querySelector('.viewer-content');
  content.innerHTML = ''; // 🔄 Maak container leeg

  const renderWindow = vtk.Rendering.Core.vtkRenderWindow.newInstance();
  const renderer = vtk.Rendering.Core.vtkRenderer.newInstance();
  renderWindow.addRenderer(renderer);

  const openGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow.newInstance();
  openGLRenderWindow.setContainer(content);
  renderWindow.addView(openGLRenderWindow);
  openGLRenderWindow.setSize(content.clientWidth, content.clientHeight);

  const interactor = vtk.Rendering.Core.vtkRenderWindowInteractor.newInstance();
  interactor.setView(openGLRenderWindow); 
  interactor.initialize();
  interactor.bindEvents(content);

  if (interactorStyle === '2D') {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleImage.newInstance());
  } else {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleTrackballCamera.newInstance());
  }
  return { renderer, renderWindow };
}

// 2D/3D weergaves laden met volumeData
function loadVolumeToViewers(volumeData) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  imageData.setDimensions(volumeData.dimensions);

  if (volumeData.spacing) {
    imageData.setSpacing(...volumeData.spacing);
  } else {
    imageData.setSpacing(1, 1, 1);
  }

  const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
    name: 'Scalars',
    values: new Uint8Array(volumeData.data),
    numberOfComponents: 1 
  });
  imageData.getPointData().setScalars(dataArray);

  let slicingModeMap;
  let views;

  if (volumeData.sourceType === 'dicom') {
    slicingModeMap = {
      I: vtk.Rendering.Core.vtkImageMapper.SlicingMode.X,
      J: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Y,
      K: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Z
    };

    views = [
      { id: 'viewer-3d', style: '3D', mapper: 'volume' },
      { id: 'viewer-axial', mode: 'K' },
      { id: 'viewer-coronal', mode: 'J' },
      { id: 'viewer-sagittal', mode: 'I' }
    ];
  } else if (volumeData.sourceType === 'nifti') {
    slicingModeMap = {
      J: vtk.Rendering.Core.vtkImageMapper.SlicingMode.X,
      K: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Y,
      I: vtk.Rendering.Core.vtkImageMapper.SlicingMode.Z
    };

    views = [
      { id: 'viewer-3d', style: '3D', mapper: 'volume' },
      { id: 'viewer-axial', mode: 'I' },
      { id: 'viewer-coronal', mode: 'K' },
      { id: 'viewer-sagittal', mode: 'J' }
    ];
  } else {
    throw new Error(`Onbekende sourceType: ${volumeData.sourceType}`);
  }

  views.forEach(view => {
    try {
      const { renderer, renderWindow } = createViewer(view.id, view.style || '2D');

      if (view.mapper === 'volume') {
        const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        volumeMapper.setInputData(imageData);
        const volume = vtk.Rendering.Core.vtkVolume.newInstance();
        volume.setMapper(volumeMapper);

        //Voeg volume properties toe 
        const volumeProperty = vtk.Rendering.Core.vtkVolumeProperty.newInstance();
        volumeProperty.setShade(true);
        volumeProperty.setInterpolationTypeToLinear();
        const ctfun = vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
        ctfun.addRGBPoint(0, 0.0, 0.0, 0.0);
        ctfun.addRGBPoint(255, 1.0, 1.0, 1.0);
        const ofun = vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();
        ofun.addPoint(0.0, 0.0);
        ofun.addPoint(255.0, 1.0);
        volumeProperty.setRGBTransferFunction(0, ctfun);
        volumeProperty.setScalarOpacity(0, ofun);
        volume.setProperty(volumeProperty);

        renderer.addVolume(volume);
      } else {
        const mapper = vtk.Rendering.Core.vtkImageMapper.newInstance();
        mapper.setInputData(imageData);

        const slicingMode = slicingModeMap[view.mode];
        if (slicingMode === undefined) {
          throw new Error(`Ongeldige slicing mode: ${view.mode}`);
        }

        mapper.setSlicingMode(slicingMode);

        const axisIndexMap = { I: 0, J: 1, K: 2 };
        const axisIndex = axisIndexMap[view.mode];
        const dim = volumeData.dimensions;

        if (!dim || typeof dim[axisIndex] === 'undefined') {
          throw new Error(`Ongeldige dimensies voor slicing mode ${view.mode}: ${dim}`);
        }

        const sliceIndex = Math.floor(dim[axisIndex] / 2);
        mapper.setSliceAtFocalPoint(true);
        mapper.setSlice(sliceIndex);

        const slice = vtk.Rendering.Core.vtkImageSlice.newInstance();
        slice.setMapper(mapper);
        renderer.addViewProp(slice);
      }

      // const camera = renderer.getActiveCamera();
      // camera.setParallelProjection(true);
      renderer.resetCamera();
      renderWindow.render();

    } catch (error) {
      console.error(`Fout bij renderen view ${view.id}:`, error);
      addLog(`Fout bij laden viewer ${view.id}: ${error.message}`);
    }
  });
}

//
// Volume ophalen en visualiseren
//

// DICOM volume ophalen en renderen
function fetchAndVisualizeVolume() {
  addLog('Start visualisatie van DICOM volume...');

  fetch('/media/volume.json?t=' + new Date().getTime())
    .then(response => {
      if (!response.ok) throw new Error("Bestand bestaat niet of is verwijderd.");
      return response.json();
    })
    .then(data => {
      const voxels = data.voxels;

      if (!Array.isArray(voxels) || !Array.isArray(voxels[0]) || !Array.isArray(voxels[0][0])) {
        throw new Error("Volume data is ongeldig of leeg");
      }
      const spacing = data.spacing || [0.25, 0.25, 1.0];
      const dims = [voxels[0][0].length, voxels[0].length, voxels.length]; // [x, y, z]
      const flatData = new Uint8Array(dims[0] * dims[1] * dims[2]);
      let idx = 0;    
      for (let z = 0; z < dims[2]; z++) {
        for (let y = 0; y < dims[1]; y++) {
          for (let x = 0; x < dims[0]; x++) {
            flatData[idx++] = voxels[z][y][x];
          }
        }
      }
      if (flatData.length !== dims[0] * dims[1] * dims[2]) {
        throw new Error("Volume data lengte komt niet overeen met dimensies");    
      }
      // Log de dimensies en spacing
      addLog('Volume data succesvol geladen, start visualisatie...');
      addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
      addLog(`Volume data lengte: ${flatData.length}`);
      if (flatData.length === 0) {
        throw new Error("Volume data is leeg");
      }
      
      loadVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'dicom' });
      addLog('DICOM volume geladen en gevisualiseerd.');
    })
    .catch(error => {
      console.error('Fout bij laden DICOM volume:', error);
      addLog('Geen DICOM volume gevonden. JSON file leeg of onleesbaar');
    });
}

// NIFTI volume ophalen en renderen
function fetchAndVisualizeNifti() {
  addLog('Start visualisatie van NIFTI volume...');

  fetch('/media/volume_nifti.json?t=' + new Date().getTime()) 
    .then(response => {
      if (!response.ok) throw new Error("NIFTI volume niet gevonden");
      return response.json();
    })
    .then(data => {
      const voxels = data.voxels;
      const spacing = data.spacing || [1.0, 1.0, 1.0];
      const dims = [voxels[0][0].length, voxels[0].length, voxels.length]; // [x, y, z]

      // Flatten 3D array in juiste volgorde
      const flatData = new Uint8Array(dims[0] * dims[1] * dims[2]);
      let idx = 0;
      for (let z = 0; z < dims[2]; z++) {
        for (let y = 0; y < dims[1]; y++) {
          for (let x = 0; x < dims[0]; x++) {
            flatData[idx++] = voxels[z][y][x];
          }
        }
      }
      // Log de dimensies en spacing
      addLog('Volume data succesvol geladen, start visualisatie...');
      addLog(`Volume dimensies: ${dims.join(' x ')}, Spacing: ${spacing.join(', ')}`);
      addLog(`Volume data lengte: ${flatData.length}`);
      if (flatData.length === 0) {
        throw new Error("Volume data is leeg");
      }

      loadVolumeToViewers({ data: flatData, dimensions: dims, spacing: spacing, sourceType: 'nifti' });
      addLog('NIFTI volume geladen en gevisualiseerd.');
    })
    .catch(error => {   
      console.error('Fout bij laden NIFTI volume:', error);
      addLog('Geen NIFTI volume gevonden: JSON file leeg of onleesbaar');
    });    
}

//
// 🧩 Gebruikersinteractie
//

// Uploadform verwerken DICOM-bestanden
document.getElementById('dicom-upload-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const formData = new FormData(this);
  addLog('DICOM Bestanden worden geüpload...');
  fetch('/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      addLog('DICOM Bestanden succesvol geüpload.');
      fetchAndVisualizeVolume();
    }
  })
  .catch(error => {
    console.error('Upload fout:', error);
    addLog('Upload DICOM mislukt.');   
  });
});

// Uploadform verwerken NIFTI-bestanden
document.getElementById('nifti-upload-form').addEventListener('submit', function(e) {
  e.preventDefault();

  const formData = new FormData(this);
  addLog('NIFTI bestand wordt geüpload...');

  fetch('/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
    body: formData,
  })
  .then(response => {
    if (response.ok) {
      addLog('NIFTI bestand succesvol geüpload.');
      fetchAndVisualizeNifti();
    } else {
      addLog('Fout bij upload NIFTI.');
    }
  })
  .catch(error => {
    console.error('Upload fout:', error);
    addLog('Upload NIFTI mislukt.');
  });
});

// Viewer resetten
document.getElementById('reset-viewer-btn').addEventListener('click', () => {
  addLog('Resetten van viewer en media...');

  ['viewer-3d', 'viewer-axial', 'viewer-coronal', 'viewer-sagittal'].forEach(id => {
    const container = document.getElementById(id);
    const content = container.querySelector('.viewer-content');
    if (content) content.innerHTML = '';
  });

  fetch('/reset/', {
    method: 'POST',
    headers: { 'X-CSRFToken': getCSRFToken() },
  })
  .then(response => {
    if (response.ok) {
      addLog('Viewer geleegd, media verwijderd.');
    } else {
      addLog('Fout bij resetten van media.');
    }
  })
  .catch(error => {
    console.error('Reset fout:', error);
    addLog('Fout bij communicatie met server.');
  });
});