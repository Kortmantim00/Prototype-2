import os
import json
import numpy as np
import nibabel as nib

def convert_nifti_to_json(nifti_path, output_path='media/volume_nifti.json'):
    nifti_img = nib.load(nifti_path)
    data = nifti_img.get_fdata()

    # Fix spacing-conversie!
    spacing_raw = nifti_img.header.get_zooms()[:3]
    spacing = [float(spacing_raw[2]), float(spacing_raw[1]), float(spacing_raw[0])] 
    data_clipped = np.clip(data, 0, 255).astype(np.uint8)
    voxels_list = data_clipped.tolist()

    output_data = {
        'voxels': voxels_list,
        'spacing': spacing
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Schrijf eerst naar tijdelijk bestand
    temp_path = output_path + '.tmp'
    with open(temp_path, 'w') as f:
        json.dump(output_data, f)
        f.flush()
        os.fsync(f.fileno())

    os.replace(temp_path, output_path)

    # Optioneel: controleer JSON geldigheid
    try:
        with open(output_path) as f:
            json.load(f)
    except json.JSONDecodeError as e:
        print(f"JSON validatiefout: {e}")

    return output_path

