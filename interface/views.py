from django.shortcuts import render
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import os
import shutil
from .utils.dicom_utils import dicom_to_voxel, save_volume_as_json
from .utils.nifti_utils import convert_nifti_to_json

from django.http import JsonResponse
import os
from django.conf import settings

def check_volume_ready(request):
    json_path = os.path.join(settings.MEDIA_ROOT, 'volume.json')
    exists = os.path.exists(json_path)
    return JsonResponse({'ready': exists})


def home(request):
    log_messages = []  # Frontend-log verzameling

    if request.method == 'POST':
        # === DICOM verwerking ===
        if request.FILES.getlist('dicom_file'):
            files = request.FILES.getlist('dicom_file')
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'dicoms')
            os.makedirs(upload_dir, exist_ok=True)

            for f in files:
                file_path = os.path.join(upload_dir, f.name)
                with open(file_path, 'wb+') as dest:
                    for chunk in f.chunks():
                        dest.write(chunk)
            log_messages.append("DICOM bestanden succesvol geüpload.")

            try:
                voxel, spacing = dicom_to_voxel(upload_dir)
                json_path = os.path.join(settings.MEDIA_ROOT, 'volume.json')
                save_volume_as_json(voxel, json_path, spacing)
                log_messages.append("DICOM volume geconverteerd en opgeslagen.")
            except Exception as e:
                print(f"Fout bij DICOM verwerking: {str(e)}")
                log_messages.append(f"Fout bij DICOM verwerking: {str(e)}")

        # === NIFTI verwerking ===
        if 'nifti_file' in request.FILES:
            nifti_file = request.FILES['nifti_file']
            upload_dir = os.path.join(settings.MEDIA_ROOT, 'niftis')
            os.makedirs(upload_dir, exist_ok=True)
            file_path = os.path.join(upload_dir, nifti_file.name)

            with open(file_path, 'wb+') as dest:
                for chunk in nifti_file.chunks():
                    dest.write(chunk)
            log_messages.append("NIfTI bestand succesvol geüpload.")

            try:
                json_path = os.path.join(settings.MEDIA_ROOT, 'volume_nifti.json')
                convert_nifti_to_json(file_path, output_path=json_path)
                log_messages.append("NIfTI volume geconverteerd en opgeslagen.")
            except Exception as e:
                log_messages.append(f"Fout bij NIfTI verwerking: {str(e)}")

    return render(request, 'interface/home.html', {
        'log_messages': log_messages
    })

@csrf_exempt
def reset_viewer(request):
    if request.method == 'POST':
        media_path = os.path.join(settings.MEDIA_ROOT)
        try:
            for filename in os.listdir(media_path):
                file_path = os.path.join(media_path, filename)
                if os.path.isfile(file_path):
                    os.remove(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            return JsonResponse({'status': 'ok', 'log': 'Media-map succesvol geleegd.'})
        except Exception as e:
            return JsonResponse({
                'status': 'error',
                'message': str(e),
                'log': 'Fout bij het leegmaken van de media-map.'
            })
    return JsonResponse({'status': 'invalid', 'log': 'Ongeldig verzoek.'}, status=405)
