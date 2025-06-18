import pydicom
import numpy as np
import os
import json


def dicom_to_voxel(dicom_folder):
    """Converteert DICOM-bestanden in een map naar een 3D volume
    let daarbij op sorteervolgorde van slices op basis van ImagePositionPatient of InstanceNumber.
    let daarbij op de juiste voxel spacing en slice thickness."""
    slices = []
    spacing = [1.0, 1.0, 1.0]  # default fallback
    slice_info = []

    dicom_files = [f for f in os.listdir(dicom_folder) if not f.startswith('.')]  # ignore hidden files

    for filename in dicom_files:
        path = os.path.join(dicom_folder, filename)
        try:
            ds = pydicom.dcmread(path)
            if hasattr(ds, 'pixel_array'):
                # Slice position als sorteer-key
                if hasattr(ds, 'ImagePositionPatient'):
                    position = ds.ImagePositionPatient
                    slice_loc = float(position[2])  # z-positie in patiënt coördinaten
                elif hasattr(ds, 'InstanceNumber'):
                    slice_loc = float(ds.InstanceNumber)
                else:
                    slice_loc = None  # fallback

                # Pixel spacing en slice thickness ophalen 
                if spacing == [1.0, 1.0, 1.0]:
                    if hasattr(ds, 'PixelSpacing') and hasattr(ds, 'SliceThickness'):
                        spacing = [
                            float(ds.PixelSpacing[1]),  # x spacing (col)
                            float(ds.PixelSpacing[0]),  # y spacing (row)
                            float(ds.SliceThickness)    # z spacing
                        ]

                slice_info.append((slice_loc, ds.pixel_array))
        except Exception as e:
            print(f"Skipping non-DICOM file or invalid file: {filename} ({e})")

    # Filter slices zonder positie eruit
    slice_info = [s for s in slice_info if s[0] is not None]

    if not slice_info:
        raise ValueError("No valid DICOM slices with positional information found.")

    # Sorteer op slice locatie (bijvoorbeeld z-positie)
    slice_info.sort(key=lambda x: x[0])

    # Haal pixel_arrays eruit in correcte volgorde
    slices = [s[1] for s in slice_info]

    volume = np.stack(slices)
    return volume.tolist(), spacing

import tempfile
import shutil

def save_volume_as_json(volume, output_path, spacing):
    """Slaat het volume en spacing op als JSON."""
    with open(output_path, 'w') as f:
        json.dump({'voxels': volume, 'spacing': spacing}, f)