// CSRF token ophalen
function getCSRFToken() {
  return document.querySelector('[name=csrfmiddlewaretoken]').value;
}

// Log toevoegen aan de interface
function addLog(message) {
  const logList = document.getElementById('log-list');
  if (!logList) return;
  const entry = document.createElement('li');
  const timestamp = new Date().toLocaleTimeString();
  entry.textContent = `[${timestamp}] ${message}`;
  logList.appendChild(entry);
  logList.scrollTop = logList.scrollHeight;
}

// DICOM viewer setup
function createViewer(containerId, interactorStyle = '2D') {
  const container = document.getElementById(containerId);

  const renderWindow = vtk.Rendering.Core.vtkRenderWindow.newInstance();
  const renderer = vtk.Rendering.Core.vtkRenderer.newInstance();
  renderWindow.addRenderer(renderer);

  const openGLRenderWindow = vtk.Rendering.OpenGL.vtkRenderWindow.newInstance();
  openGLRenderWindow.setContainer(container);
  renderWindow.addView(openGLRenderWindow);
  openGLRenderWindow.setSize(container.clientWidth, container.clientHeight);

  const interactor = vtk.Rendering.Core.vtkRenderWindowInteractor.newInstance();
  interactor.setView(openGLRenderWindow);
  interactor.initialize();
  interactor.bindEvents(container);

  if (interactorStyle === '2D') {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleImage.newInstance());
  } else {
    interactor.setInteractorStyle(vtk.Interaction.Style.vtkInteractorStyleTrackballCamera.newInstance());
  }

  return { renderer, renderWindow };
}

// Volume laden in viewer
function loadVolumeToViewers(volumeData) {
  const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
  const dims = volumeData.dimensions;
  imageData.setDimensions(dims);

  const dataArray = vtk.Common.Core.vtkDataArray.newInstance({
    name: 'Scalars',
    values: new Uint8Array(volumeData.data),
  });

  imageData.getPointData().setScalars(dataArray);

  // 3D Viewer
  const { renderer: r3D, renderWindow: rw3D } = createViewer('viewer-3d', '3D');
  const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
  volumeMapper.setInputData(imageData);
  const volume = vtk.Rendering.Core.vtkVolume.newInstance();
  volume.setMapper(volumeMapper);
  r3D.addVolume(volume);
  r3D.resetCamera();
  rw3D.render();

  // Axial Viewer
  const { renderer: rAxial, renderWindow: rwAxial } = createViewer('viewer-axial', '2D');
  const mAxial = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mAxial.setInputData(imageData);
  mAxial.setSliceAtFocalPoint(true);
  mAxial.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.K);
  mAxial.setSlice(Math.floor(dims[2] / 2));
  const sAxial = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sAxial.setMapper(mAxial);
  rAxial.addViewProp(sAxial);
  rAxial.resetCamera();
  rwAxial.render();

  // Coronal Viewer
  const { renderer: rCoronal, renderWindow: rwCoronal } = createViewer('viewer-coronal', '2D');
  const mCoronal = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mCoronal.setInputData(imageData);
  mCoronal.setSliceAtFocalPoint(true);
  mCoronal.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.J);
  mCoronal.setSlice(Math.floor(dims[1] / 2));
  const sCoronal = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sCoronal.setMapper(mCoronal);
  rCoronal.addViewProp(sCoronal);
  rCoronal.resetCamera();
  rwCoronal.render();

  // Sagittal Viewer
  const { renderer: rSagittal, renderWindow: rwSagittal } = createViewer('viewer-sagittal', '2D');
  const mSagittal = vtk.Rendering.Core.vtkImageMapper.newInstance();
  mSagittal.setInputData(imageData);
  mSagittal.setSliceAtFocalPoint(true);
  mSagittal.setSlicingMode(vtk.Rendering.Core.vtkImageMapper.SlicingMode.I);
  mSagittal.setSlice(Math.floor(dims[0] / 2));
  const sSagittal = vtk.Rendering.Core.vtkImageSlice.newInstance();
  sSagittal.setMapper(mSagittal);
  rSagittal.addViewProp(sSagittal);
  rSagittal.resetCamera();
  rwSagittal.render();
}

// Ophalen volume JSON
function fetchAndVisualizeVolume() {
  fetch('/media/volume.json')
    .then(response => response.json())
    .then(data => {
      const voxels = data.voxels;
      const dims = [voxels[0][0].length, voxels[0].length, voxels.length];
      const flatData = voxels.flat(2);
      loadVolumeToViewers({ data: flatData, dimensions: dims });
      addLog('Volume geladen en gevisualiseerd.');
    })
    .catch(error => {
      console.error('Fout bij laden JSON:', error);
      addLog('Fout bij visualiseren van volume.');
    });
}

// Koppel aan knop
document.getElementById('visualize-btn').addEventListener('click', function () {
  addLog('Start visualiseren van DICOM volume...');
  fetchAndVisualizeVolume();
});

async function loadAndVisualizeNifti() {
    try {
        // Laad de voxel data (volume) uit JSON
        const response = await fetch('/media/volume_nifti.json');
        if (!response.ok) throw new Error('JSON niet gevonden');

        const data = await response.json();
        const voxels = data.voxels;

        // Converteer voxels (3D array) naar vlakke typed array (Float32Array)
        // Let op: afhankelijk van jouw volume data formaat moet je shape kennen.
        // Hier een voorbeeld waarbij volume 3D vorm is [depth][height][width]

        const depth = voxels.length;
        const height = voxels[0].length;
        const width = voxels[0][0].length;

        const flatData = new Float32Array(depth * height * width);
        let idx = 0;
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    flatData[idx++] = voxels[z][y][x];
                }
            }
        }

        // Setup VTK.js rendering
        const fullScreenRenderer = vtk.Rendering.Misc.vtkFullScreenRenderWindow.newInstance({
            rootContainer: document.getElementById('viewer-3d'),
            background: [0, 0, 0],
        });
        const renderer = fullScreenRenderer.getRenderer();
        const renderWindow = fullScreenRenderer.getRenderWindow();

        // Maak vtkImageData aan
        const imageData = vtk.Common.DataModel.vtkImageData.newInstance();
        imageData.setDimensions(width, height, depth);
        imageData.getPointData().setScalars(
            vtk.Common.Core.vtkDataArray.newInstance({
                numberOfComponents: 1,
                values: flatData,
                dataType: 'Float32Array',
            })
        );

        // Volume mapper en actor
        const volumeMapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
        volumeMapper.setInputData(imageData);

        const volume = vtk.Rendering.Core.vtkVolume.newInstance();
        volume.setMapper(volumeMapper);

        // Voeg volume toe aan scene
        renderer.addVolume(volume);
        renderer.resetCamera();
        renderWindow.render();

    } catch (error) {
        console.error('Fout bij laden of visualiseren van NIFTI:', error);
    }
}

// Koppel aan knop
document.getElementById('visualize-nifti-btn').addEventListener('click', function () {
  addLog('Start visualiseren van NIFTI volume...');
  fetchAndVisualizeVolume();
});